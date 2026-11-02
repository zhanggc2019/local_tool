package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"example.com/pdf-desktop/internal/tools/pdfexport"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// ExportTarget is returned to the frontend after a save location is selected.
type ExportTarget struct {
	Token    string `json:"token"`
	Location string `json:"location"`
}

// ExportResult summarizes the images written by a completed export.
type ExportResult struct {
	Location string `json:"location"`
	Count    int    `json:"count"`
}

type exportSession struct {
	token    string
	mode     string
	format   pdfexport.Format
	location string
	stem     string
	pages    int
	written  []string
}

// PDFExportService owns the native save dialog and one in-progress PDF export.
type PDFExportService struct {
	mu         sync.Mutex
	session    *exportSession
	lastOutput string
}

// NewPDFExportService creates a standalone service for the PDF tool.
func NewPDFExportService() *PDFExportService {
	return &PDFExportService{}
}

// BeginExport validates settings and asks the user where to save the images.
func (s *PDFExportService) BeginExport(filename, mode, imageFormat string, pageCount int) (ExportTarget, error) {
	return s.beginExport(filename, "", mode, imageFormat, pageCount)
}

// BeginExportBesideSource saves converted images in the input PDF's directory.
func (s *PDFExportService) BeginExportBesideSource(sourcePath, mode, imageFormat string, pageCount int) (ExportTarget, error) {
	return s.beginExport(filepath.Base(sourcePath), sourcePath, mode, imageFormat, pageCount)
}

// beginExport validates settings and starts one export at the requested location.
func (s *PDFExportService) beginExport(filename, sourcePath, mode, imageFormat string, pageCount int) (ExportTarget, error) {
	var empty ExportTarget
	if mode != "single" && mode != "split" {
		return empty, errors.New("无效的分页模式")
	}
	format := pdfexport.Format(imageFormat)
	extension, err := format.Extension()
	if err != nil {
		return empty, err
	}
	if pageCount < 1 || pageCount > 500 {
		return empty, errors.New("仅支持 1 至 500 页的 PDF")
	}
	s.mu.Lock()
	if s.session != nil {
		s.mu.Unlock()
		return empty, errors.New("已有导出任务正在进行")
	}
	s.mu.Unlock()

	stem := pdfexport.CleanStem(filename)
	app := application.Get()
	if app == nil {
		return empty, errors.New("桌面窗口尚未就绪")
	}
	var location string
	if sourcePath != "" {
		if mode == "single" {
			location, err = sameSourceOutput(sourcePath, "_图片", extension)
		} else {
			if _, err = os.Stat(sourcePath); err == nil {
				location = filepath.Dir(sourcePath)
			}
		}
	} else if mode == "single" {
		location, err = app.Dialog.SaveFile().
			SetMessage("保存合成图片").
			SetFilename(stem+extension).
			AddFilter("图片", "*"+extension).
			PromptForSingleSelection()
	} else {
		location, err = app.Dialog.OpenFile().
			SetTitle("选择按页导出的文件夹").
			CanChooseDirectories(true).
			CanChooseFiles(false).
			PromptForSingleSelection()
	}
	if err != nil {
		return empty, err
	}
	if location == "" {
		return empty, nil
	}
	if mode == "single" && !strings.EqualFold(filepath.Ext(location), extension) {
		location += extension
	}

	tokenBytes := make([]byte, 16)
	if _, err := rand.Read(tokenBytes); err != nil {
		return empty, err
	}
	token := hex.EncodeToString(tokenBytes)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session != nil {
		return empty, errors.New("已有导出任务正在进行")
	}
	s.session = &exportSession{token: token, mode: mode, format: format, location: location, stem: stem, pages: pageCount}
	return ExportTarget{Token: token, Location: location}, nil
}

// WriteImage validates and atomically writes the next image in an export.
func (s *PDFExportService) WriteImage(token string, pageNumber int, encoded string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	job := s.session
	if job == nil || token != job.token {
		return errors.New("导出任务不存在或已结束")
	}
	expected := len(job.written) + 1
	if pageNumber != expected || pageNumber > job.pages || (job.mode == "single" && pageNumber != 1) {
		return errors.New("图片页码顺序无效")
	}
	data, err := pdfexport.DecodeImage(encoded, job.format)
	if err != nil {
		return err
	}
	path := job.location
	if job.mode == "split" {
		ext, _ := job.format.Extension()
		filename := fmt.Sprintf("%s_%03d%s", job.stem, pageNumber, ext)
		path, err = pdfexport.UniquePath(job.location, filename)
		if err != nil {
			return err
		}
	}
	if err := pdfexport.WriteAtomic(path, data); err != nil {
		return err
	}
	job.written = append(job.written, path)
	return nil
}

// FinishExport closes a fully written session and remembers its output folder.
func (s *PDFExportService) FinishExport(token string) (ExportResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	job := s.session
	if job == nil || token != job.token {
		return ExportResult{}, errors.New("导出任务不存在或已结束")
	}
	expected := job.pages
	if job.mode == "single" {
		expected = 1
	}
	if len(job.written) != expected {
		return ExportResult{}, errors.New("还有页面未导出")
	}
	location := job.location
	if job.mode == "single" {
		s.lastOutput = filepath.Dir(location)
	} else {
		s.lastOutput = location
	}
	s.session = nil
	return ExportResult{Location: location, Count: expected}, nil
}

// AbortExport removes newly written split images after a failed conversion.
func (s *PDFExportService) AbortExport(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil || s.session.token != token {
		return
	}
	if s.session.mode == "split" {
		for _, path := range s.session.written {
			_ = os.Remove(path)
		}
	}
	s.session = nil
}

// OpenOutputFolder opens the most recent export location in the file manager.
func (s *PDFExportService) OpenOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已完成的导出")
	}
	return application.Get().Env.OpenFileManager(path, false)
}
