package app

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// PDFPageService stores one selected PDF for page-level operations.
type PDFPageService struct {
	mu         sync.Mutex
	source     string
	pages      int
	lastOutput string
	busy       bool
}

// NewPDFPageService creates the native PDF page management service.
func NewPDFPageService() *PDFPageService { return &PDFPageService{} }

// ChoosePDF selects one PDF and reports its page count.
func (s *PDFPageService) ChoosePDF() (PDFSource, error) {
	app := application.Get()
	if app == nil {
		return PDFSource{}, errors.New("桌面窗口尚未就绪")
	}
	s.mu.Lock()
	busy := s.busy
	s.mu.Unlock()
	if busy {
		return PDFSource{}, errors.New("正在处理 PDF")
	}
	path, err := app.Dialog.OpenFile().SetTitle("选择 PDF 文件").AddFilter("PDF 文件", "*.pdf").PromptForSingleSelection()
	if err != nil || path == "" {
		return PDFSource{}, err
	}
	if !strings.EqualFold(filepath.Ext(path), ".pdf") {
		return PDFSource{}, errors.New("只能选择 PDF 文件")
	}
	info, err := os.Stat(path)
	if err != nil {
		return PDFSource{}, err
	}
	if info.IsDir() {
		return PDFSource{}, errors.New("请选择 PDF 文件")
	}
	pages, err := api.PageCountFile(path)
	if err != nil {
		return PDFSource{}, fmt.Errorf("无法读取 %s：%w", info.Name(), err)
	}
	s.mu.Lock()
	s.source = path
	s.pages = pages
	s.lastOutput = ""
	s.mu.Unlock()
	return PDFSource{Name: info.Name(), Pages: pages, Bytes: info.Size()}, nil
}

// parsePageToken expands one comma-separated page token.
func parsePageToken(token string, pageCount int) ([]int, error) {
	lower := strings.ToLower(strings.TrimSpace(token))
	switch lower {
	case "", "all", "全部", "全部页":
		pages := make([]int, pageCount)
		for index := range pages {
			pages[index] = index + 1
		}
		return pages, nil
	case "even", "偶数", "偶数页":
		var pages []int
		for page := 2; page <= pageCount; page += 2 {
			pages = append(pages, page)
		}
		return pages, nil
	case "odd", "奇数", "奇数页":
		var pages []int
		for page := 1; page <= pageCount; page += 2 {
			pages = append(pages, page)
		}
		return pages, nil
	}
	parseNumber := func(text string) (int, error) {
		number, err := strconv.Atoi(strings.TrimSpace(text))
		if err != nil || number < 1 || number > pageCount {
			return 0, fmt.Errorf("页码 %q 不在 1–%d 范围内", text, pageCount)
		}
		return number, nil
	}
	if strings.Contains(lower, "-") {
		parts := strings.SplitN(lower, "-", 2)
		start, end := 1, pageCount
		var err error
		if strings.TrimSpace(parts[0]) != "" {
			if start, err = parseNumber(parts[0]); err != nil {
				return nil, err
			}
		}
		if strings.TrimSpace(parts[1]) != "" {
			if end, err = parseNumber(parts[1]); err != nil {
				return nil, err
			}
		}
		if start > end {
			return nil, fmt.Errorf("页码范围 %q 起点大于终点", token)
		}
		pages := make([]int, 0, end-start+1)
		for page := start; page <= end; page++ {
			pages = append(pages, page)
		}
		return pages, nil
	}
	page, err := parseNumber(lower)
	if err != nil {
		return nil, err
	}
	return []int{page}, nil
}

// parsePageSelection expands a page selection expression into sorted pages.
func parsePageSelection(input string, pageCount int) ([]int, error) {
	if pageCount < 1 {
		return nil, errors.New("PDF 页数无效")
	}
	normalized := strings.NewReplacer("，", ",", "、", ",", ";", ",", "；", ",").Replace(input)
	var pages []int
	for _, token := range strings.Split(normalized, ",") {
		token = strings.TrimSpace(token)
		if token == "" {
			continue
		}
		expanded, err := parsePageToken(token, pageCount)
		if err != nil {
			return nil, err
		}
		pages = append(pages, expanded...)
	}
	if len(pages) == 0 {
		return nil, errors.New("请输入页码，例如 1-3,5")
	}
	sort.Ints(pages)
	unique := pages[:1]
	for _, page := range pages[1:] {
		if page != unique[len(unique)-1] {
			unique = append(unique, page)
		}
	}
	for _, page := range unique {
		if page < 1 || page > pageCount {
			return nil, fmt.Errorf("页码 %d 超出 1–%d 范围", page, pageCount)
		}
	}
	return unique, nil
}

// selectionTokens converts page numbers into the pdfcpu selection form.
func selectionTokens(pages []int) []string {
	tokens := make([]string, len(pages))
	for index, page := range pages {
		tokens[index] = strconv.Itoa(page)
	}
	return tokens
}

// beginPageOperation locks the selected PDF for one operation.
func (s *PDFPageService) beginPageOperation() (string, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.busy {
		return "", 0, errors.New("正在处理 PDF")
	}
	if s.source == "" {
		return "", 0, errors.New("请先选择 PDF 文件")
	}
	if _, err := os.Stat(s.source); err != nil {
		return "", 0, err
	}
	s.busy = true
	return s.source, s.pages, nil
}

// finishPageOperation releases the lock and remembers the latest output.
func (s *PDFPageService) finishPageOperation(location string) {
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

// validateRotation accepts the three supported clockwise rotations.
func validateRotation(angle int) error {
	if angle != 90 && angle != 180 && angle != 270 {
		return errors.New("旋转角度必须是 90、180 或 270")
	}
	return nil
}

// RotatePages rotates the selected pages clockwise by the given angle.
func (s *PDFPageService) RotatePages(angle int, selection string) (PDFManageResult, error) {
	if err := validateRotation(angle); err != nil {
		return PDFManageResult{}, err
	}
	source, pageCount, err := s.beginPageOperation()
	if err != nil {
		return PDFManageResult{}, err
	}
	output := ""
	defer func() { s.finishPageOperation(output) }()
	var pages []int
	if strings.TrimSpace(selection) == "" {
		pages, err = parsePageSelection("all", pageCount)
	} else {
		pages, err = parsePageSelection(selection, pageCount)
	}
	if err != nil {
		return PDFManageResult{}, err
	}
	path, err := sameSourceOutput(source, "_旋转", ".pdf")
	if err != nil {
		return PDFManageResult{}, err
	}
	if err := api.RotateFile(source, path, angle, selectionTokens(pages), nil); err != nil {
		return PDFManageResult{}, fmt.Errorf("旋转失败：%w", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return PDFManageResult{}, err
	}
	output = path
	return PDFManageResult{Location: path, Count: len(pages), Bytes: info.Size()}, nil
}

// DeletePages removes the selected pages from a copy of the PDF.
func (s *PDFPageService) DeletePages(selection string) (PDFManageResult, error) {
	source, pageCount, err := s.beginPageOperation()
	if err != nil {
		return PDFManageResult{}, err
	}
	output := ""
	defer func() { s.finishPageOperation(output) }()
	if strings.TrimSpace(selection) == "" {
		return PDFManageResult{}, errors.New("请输入要删除的页码")
	}
	pages, err := parsePageSelection(selection, pageCount)
	if err != nil {
		return PDFManageResult{}, err
	}
	if len(pages) >= pageCount {
		return PDFManageResult{}, errors.New("不能删除全部页面")
	}
	path, err := sameSourceOutput(source, "_删除页", ".pdf")
	if err != nil {
		return PDFManageResult{}, err
	}
	if err := api.RemovePagesFile(source, path, selectionTokens(pages), nil); err != nil {
		return PDFManageResult{}, fmt.Errorf("删除页面失败：%w", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return PDFManageResult{}, err
	}
	output = path
	return PDFManageResult{Location: path, Count: pageCount - len(pages), Bytes: info.Size()}, nil
}

// ExtractPages writes the selected pages as separate PDFs in a new folder.
func (s *PDFPageService) ExtractPages(selection string) (PDFManageResult, error) {
	source, pageCount, err := s.beginPageOperation()
	if err != nil {
		return PDFManageResult{}, err
	}
	output := ""
	defer func() { s.finishPageOperation(output) }()
	if strings.TrimSpace(selection) == "" {
		return PDFManageResult{}, errors.New("请输入要提取的页码")
	}
	pages, err := parsePageSelection(selection, pageCount)
	if err != nil {
		return PDFManageResult{}, err
	}
	dir, err := uniqueSiblingDir(source, "_提取页")
	if err != nil {
		return PDFManageResult{}, err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return PDFManageResult{}, err
	}
	if err := api.ExtractPagesFile(source, dir, selectionTokens(pages), nil); err != nil {
		_ = os.RemoveAll(dir)
		return PDFManageResult{}, fmt.Errorf("提取页面失败：%w", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) == 0 {
		_ = os.RemoveAll(dir)
		return PDFManageResult{}, errors.New("提取页面失败：没有生成文件")
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

// OpenPDFPageOutputFolder reveals the latest result in the file manager.
func (s *PDFPageService) OpenPDFPageOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已完成的页面操作")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(path, false)
}
