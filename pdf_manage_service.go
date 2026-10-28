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
	Location string `json:"location"`
	Count    int    `json:"count"`
	Bytes    int64  `json:"bytes"`
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

// choosePDFOutput prompts for a destination and prevents replacing an input.
func choosePDFOutput(filename string, inputs []string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", errors.New("桌面窗口尚未就绪")
	}
	path, err := app.Dialog.SaveFile().SetMessage("保存 PDF").SetFilename(filename).AddFilter("PDF 文件", "*.pdf").PromptForSingleSelection()
	if err != nil || path == "" {
		return path, err
	}
	if !strings.EqualFold(filepath.Ext(path), ".pdf") {
		path += ".pdf"
	}
	for _, input := range inputs {
		if strings.EqualFold(filepath.Clean(input), filepath.Clean(path)) {
			return "", errors.New("输出文件不能覆盖源文件")
		}
	}
	return path, nil
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
	path, err := choosePDFOutput("合并.pdf", inputs)
	if err != nil || path == "" {
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

// SplitPDF splits the selected PDF into groups of the requested page count.
func (s *PDFManageService) SplitPDF(span int) (PDFManageResult, error) {
	inputs, err := s.beginOperation()
	if err != nil {
		return PDFManageResult{}, err
	}
	output := ""
	defer func() { s.finishOperation(output) }()
	if len(inputs) != 1 {
		return PDFManageResult{}, errors.New("拆分需要选择一个 PDF")
	}
	pages, err := api.PageCountFile(inputs[0])
	if err != nil {
		return PDFManageResult{}, err
	}
	if span < 1 || span >= pages {
		return PDFManageResult{}, errors.New("每份页数应小于 PDF 总页数")
	}
	app := application.Get()
	if app == nil {
		return PDFManageResult{}, errors.New("桌面窗口尚未就绪")
	}
	parent, err := app.Dialog.OpenFile().SetTitle("选择拆分文件的保存文件夹").CanChooseDirectories(true).CanChooseFiles(false).PromptForSingleSelection()
	if err != nil || parent == "" {
		return PDFManageResult{}, err
	}
	stem := strings.TrimSuffix(filepath.Base(inputs[0]), filepath.Ext(inputs[0]))
	dir, err := os.MkdirTemp(parent, stem+"_拆分_")
	if err != nil {
		return PDFManageResult{}, err
	}
	if err = api.SplitFile(inputs[0], dir, span, nil); err != nil {
		return PDFManageResult{}, fmt.Errorf("拆分失败，未完成的文件保留在 %s：%w", dir, err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return PDFManageResult{}, err
	}
	var bytes int64
	for _, entry := range entries {
		if info, statErr := entry.Info(); statErr == nil {
			bytes += info.Size()
		}
	}
	output = dir
	return PDFManageResult{Location: dir, Count: len(entries), Bytes: bytes}, nil
}

// CompressPDF optimizes the selected PDF and returns its actual output size.
func (s *PDFManageService) CompressPDF() (PDFManageResult, error) {
	inputs, err := s.beginOperation()
	if err != nil {
		return PDFManageResult{}, err
	}
	output := ""
	defer func() { s.finishOperation(output) }()
	if len(inputs) != 1 {
		return PDFManageResult{}, errors.New("压缩需要选择一个 PDF")
	}
	stem := strings.TrimSuffix(filepath.Base(inputs[0]), filepath.Ext(inputs[0]))
	path, err := choosePDFOutput(stem+"_压缩.pdf", inputs)
	if err != nil || path == "" {
		return PDFManageResult{}, err
	}
	if err = api.OptimizeFile(inputs[0], path, nil); err != nil {
		return PDFManageResult{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return PDFManageResult{}, err
	}
	output = path
	return PDFManageResult{Location: path, Count: 1, Bytes: info.Size()}, nil
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
