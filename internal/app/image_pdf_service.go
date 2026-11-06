package app

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// ImagePDFPageModes lists the supported page layout identifiers.
var ImagePDFPageModes = []string{"fit", "original"}

// validateImagePDFMode checks one page mode coming from the frontend.
func validateImagePDFMode(mode string) error {
	for _, candidate := range ImagePDFPageModes {
		if candidate == mode {
			return nil
		}
	}
	return errors.New("请选择页面布局")
}

// buildImageImport returns the pdfcpu import configuration for one mode.
func buildImageImport(mode string) *pdfcpu.Import {
	if mode == "original" {
		// PageDim seeds the context only; Pos=Full sizes every page to its image.
		return &pdfcpu.Import{PageDim: types.PaperSize["A4"], Pos: types.Full, InpUnit: types.POINTS}
	}
	// A4 pages with the image scaled to fit and centered.
	return &pdfcpu.Import{PageDim: types.PaperSize["A4"], PageSize: "A4", Pos: types.Center, Scale: 1.0, InpUnit: types.POINTS}
}

// ImagePDFService stores one image selection and the latest output.
type ImagePDFService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewImagePDFService creates the native images-to-PDF service.
func NewImagePDFService() *ImagePDFService { return &ImagePDFService{} }

// validateImagePDFSource checks one image path chosen for the PDF.
func validateImagePDFSource(path string) (LocalSource, error) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".jpg", ".jpeg", ".png", ".webp":
	default:
		return LocalSource{}, errors.New("图片格式不受支持")
	}
	info, err := os.Stat(path)
	if err != nil {
		return LocalSource{}, err
	}
	if info.IsDir() || info.Size() < 1 || info.Size() > 20*1024*1024 {
		return LocalSource{}, errors.New("图片为空或超过 20 MB")
	}
	return LocalSource{Name: info.Name(), Path: path, Bytes: info.Size()}, nil
}

// ChooseImages selects one or up to 50 images for the new PDF.
func (s *ImagePDFService) ChooseImages(multiple bool) ([]LocalSource, error) {
	s.mu.Lock()
	busy := s.busy
	s.mu.Unlock()
	if busy {
		return nil, errors.New("请等待当前任务完成")
	}
	app := application.Get()
	if app == nil {
		return nil, errors.New("桌面窗口尚未就绪")
	}
	dialog := app.Dialog.OpenFile().SetTitle("选择图片").AddFilter("图片", "*.jpg;*.jpeg;*.png;*.webp")
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
	if len(paths) > 50 {
		return nil, errors.New("一次最多选择 50 张图片")
	}
	result := make([]LocalSource, 0, len(paths))
	for _, path := range paths {
		file, err := validateImagePDFSource(path)
		if err != nil {
			return nil, fmt.Errorf("%s：%w", filepath.Base(path), err)
		}
		result = append(result, file)
	}
	s.mu.Lock()
	s.files = append([]string(nil), paths...)
	s.mu.Unlock()
	return result, nil
}

// CreatePDF writes one PDF from the selected images in the requested order.
func (s *ImagePDFService) CreatePDF(order []int, mode string) (PDFManageResult, error) {
	if err := validateImagePDFMode(mode); err != nil {
		return PDFManageResult{}, err
	}
	s.mu.Lock()
	if s.busy || len(s.files) == 0 {
		s.mu.Unlock()
		return PDFManageResult{}, errors.New("请先选择图片")
	}
	s.busy = true
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()
	if len(order) != len(s.files) {
		return PDFManageResult{}, errors.New("图片顺序无效")
	}
	seen := make(map[int]bool, len(order))
	ordered := make([]string, len(order))
	for i, index := range order {
		if index < 0 || index >= len(s.files) || seen[index] {
			return PDFManageResult{}, errors.New("图片顺序无效")
		}
		seen[index] = true
		ordered[i] = s.files[index]
	}
	output, err := sameSourceOutput(ordered[0], "_转PDF", ".pdf")
	if err != nil {
		return PDFManageResult{}, err
	}
	workDir, err := os.MkdirTemp(filepath.Dir(output), ".image-pdf-")
	if err != nil {
		return PDFManageResult{}, err
	}
	defer os.RemoveAll(workDir)
	staged := filepath.Join(workDir, "合成.pdf")
	if err := api.ImportImagesFile(ordered, staged, buildImageImport(mode), nil); err != nil {
		return PDFManageResult{}, fmt.Errorf("图片转 PDF 失败：%w", err)
	}
	pages, err := api.PageCountFile(staged)
	if err != nil || pages != len(ordered) {
		return PDFManageResult{}, errors.New("生成的 PDF 页数与图片数量不符")
	}
	if err := os.Rename(staged, output); err != nil {
		return PDFManageResult{}, err
	}
	info, err := os.Stat(output)
	if err != nil {
		return PDFManageResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	return PDFManageResult{Location: output, Count: pages, Bytes: info.Size()}, nil
}

// OpenImagePDFOutputFolder reveals the latest PDF in the file manager.
func (s *ImagePDFService) OpenImagePDFOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已生成的 PDF")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
