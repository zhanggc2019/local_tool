package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// PDFSource describes a PDF chosen through the native file dialog.
type PDFSource struct {
	Name  string `json:"name"`
	Pages int    `json:"pages"`
	Bytes int64  `json:"bytes"`
}

// PDFManageResult summarizes a completed PDF operation.
type PDFManageResult struct {
	Location   string   `json:"location"`
	Count      int      `json:"count"`
	Bytes      int64    `json:"bytes"`
	InputBytes int64    `json:"inputBytes"`
	Failed     []string `json:"failed"`
}

// PDFManageService owns selected paths and the latest output directory.
type PDFManageService struct {
	mu         sync.Mutex
	sources    []string
	busy       bool
	lastOutput string
}

// NewPDFManageService creates an independent PDF management service.
func NewPDFManageService() *PDFManageService { return &PDFManageService{} }

// ChoosePDFs opens a native picker and validates the selected documents.
func (s *PDFManageService) ChoosePDFs(multiple bool) ([]PDFSource, error) {
	app := application.Get()
	if app == nil {
		return nil, errors.New("桌面窗口尚未就绪")
	}
	s.mu.Lock()
	if s.busy {
		s.mu.Unlock()
		return nil, errors.New("正在处理 PDF")
	}
	s.mu.Unlock()
	dialog := app.Dialog.OpenFile().SetTitle("选择 PDF 文件").AddFilter("PDF 文件", "*.pdf")
	var paths []string
	var err error
	if multiple {
		paths, err = dialog.PromptForMultipleSelection()
	} else {
		var path string
		path, err = dialog.PromptForSingleSelection()
		if path != "" {
			paths = []string{path}
		}
	}
	if err != nil || len(paths) == 0 {
		return nil, err
	}
	if len(paths) > 100 {
		return nil, errors.New("一次最多选择 100 个 PDF")
	}
	result := make([]PDFSource, 0, len(paths))
	for _, path := range paths {
		if !strings.EqualFold(filepath.Ext(path), ".pdf") {
			return nil, errors.New("只能选择 PDF 文件")
		}
		info, statErr := os.Stat(path)
		if statErr != nil {
			return nil, statErr
		}
		if info.IsDir() {
			return nil, errors.New("请选择 PDF 文件")
		}
		pages, countErr := api.PageCountFile(path)
		if countErr != nil {
			return nil, fmt.Errorf("无法读取 %s：%w", info.Name(), countErr)
		}
		result = append(result, PDFSource{Name: info.Name(), Pages: pages, Bytes: info.Size()})
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.busy {
		return nil, errors.New("正在处理 PDF")
	}
	s.sources = paths
	return result, nil
}

// beginOperation locks the selected inputs for one operation.
func (s *PDFManageService) beginOperation() ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.busy {
		return nil, errors.New("正在处理 PDF")
	}
	if len(s.sources) == 0 {
		return nil, errors.New("请先选择 PDF 文件")
	}
	s.busy = true
	return append([]string(nil), s.sources...), nil
}

// finishOperation releases the operation lock and remembers a successful output.
func (s *PDFManageService) finishOperation(location string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.busy = false
	if location != "" {
		if info, err := os.Stat(location); err == nil && info.IsDir() {
			s.lastOutput = location
		} else {
			s.lastOutput = filepath.Dir(location)
		}
	}
}

// MergePDFs saves the selected PDFs in the requested order.
func (s *PDFManageService) MergePDFs(order []int) (PDFManageResult, error) {
	inputs, err := s.beginOperation()
	if err != nil {
		return PDFManageResult{}, err
	}
	output := ""
	defer func() { s.finishOperation(output) }()
	if len(inputs) < 2 || len(order) != len(inputs) {
		return PDFManageResult{}, errors.New("合并至少需要两个 PDF")
	}
	seen := make(map[int]bool, len(order))
	ordered := make([]string, len(order))
	for i, index := range order {
		if index < 0 || index >= len(inputs) || seen[index] {
			return PDFManageResult{}, errors.New("文件顺序无效")
		}
		seen[index] = true
		ordered[i] = inputs[index]
	}
	path, err := sameSourceOutput(ordered[0], "_合并", ".pdf")
	if err != nil {
		return PDFManageResult{}, err
	}
	if err = api.MergeCreateFile(ordered, path, false, nil); err != nil {
		return PDFManageResult{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return PDFManageResult{}, err
	}
	output = path
	return PDFManageResult{Location: path, Count: len(inputs), Bytes: info.Size()}, nil
}

// SplitPDF splits every selected PDF into a separate folder beside its source.
func (s *PDFManageService) SplitPDF(span int) (PDFManageResult, error) {
	inputs, err := s.beginOperation()
	if err != nil {
		return PDFManageResult{}, err
	}
	output := ""
	defer func() { s.finishOperation(output) }()
	if span < 1 {
		return PDFManageResult{}, errors.New("每份页数至少为 1")
	}
	var bytes int64
	count := 0
	var failed []string
	for _, input := range inputs {
		pages, err := api.PageCountFile(input)
		if err != nil || span >= pages {
			failed = append(failed, filepath.Base(input)+"：无法读取或页数不足")
			continue
		}
		stem := strings.TrimSuffix(filepath.Base(input), filepath.Ext(input))
		dir, err := os.MkdirTemp(filepath.Dir(input), stem+"_拆分_")
		if err != nil {
			failed = append(failed, filepath.Base(input)+"："+err.Error())
			continue
		}
		if err = api.SplitFile(input, dir, span, nil); err != nil {
			failed = append(failed, filepath.Base(input)+"：拆分失败，未完成文件位于 "+dir)
			continue
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			failed = append(failed, filepath.Base(input)+"："+err.Error())
			continue
		}
		count += len(entries)
		for _, entry := range entries {
			if info, statErr := entry.Info(); statErr == nil {
				bytes += info.Size()
			}
		}
		if output == "" {
			output = dir
		}
	}
	if count == 0 {
		return PDFManageResult{}, errors.New(strings.Join(failed, "；"))
	}
	return PDFManageResult{Location: output, Count: count, Bytes: bytes, Failed: failed}, nil
}

// CompressPDF optimizes every selected PDF beside its source file.
func (s *PDFManageService) CompressPDF() (PDFManageResult, error) {
	inputs, err := s.beginOperation()
	if err != nil {
		return PDFManageResult{}, err
	}
	output := ""
	defer func() { s.finishOperation(output) }()
	var bytes int64
	var inputBytes int64
	var failed []string
	for _, input := range inputs {
		path, err := sameSourceOutput(input, "_压缩", ".pdf")
		if err != nil {
			failed = append(failed, filepath.Base(input)+"："+err.Error())
			continue
		}
		if err = api.OptimizeFile(input, path, nil); err != nil {
			failed = append(failed, filepath.Base(input)+"："+err.Error())
			continue
		}
		info, err := os.Stat(path)
		if err != nil {
			failed = append(failed, filepath.Base(input)+"："+err.Error())
			continue
		}
		bytes += info.Size()
		if sourceInfo, statErr := os.Stat(input); statErr == nil {
			inputBytes += sourceInfo.Size()
		}
		if output == "" {
			output = path
		}
	}
	if output == "" {
		return PDFManageResult{}, errors.New(strings.Join(failed, "；"))
	}
	return PDFManageResult{Location: output, Count: len(inputs) - len(failed), Bytes: bytes, InputBytes: inputBytes, Failed: failed}, nil
}

// OpenPDFOutputFolder reveals the latest PDF result in the file manager.
func (s *PDFManageService) OpenPDFOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已完成的 PDF 操作")
	}
	return application.Get().Env.OpenFileManager(path, false)
}
