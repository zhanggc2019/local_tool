package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// LocalSource describes a file selected through the desktop file picker.
type LocalSource struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Bytes int64  `json:"bytes"`
}

// SourceFileService keeps independent selections for the PDF and image tools.
type SourceFileService struct {
	mu    sync.Mutex
	files map[string][]string
}

// NewSourceFileService creates the native input service.
func NewSourceFileService() *SourceFileService {
	return &SourceFileService{files: make(map[string][]string)}
}

// sourceRules returns allowed extensions and the largest input size for a tool.
func sourceRules(kind string) (map[string]bool, int64, error) {
	switch kind {
	case "pdf-image":
		return map[string]bool{".pdf": true}, 100 * 1024 * 1024, nil
	case "photo", "watermark":
		return map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}, 20 * 1024 * 1024, nil
	default:
		return nil, 0, errors.New("未知的文件工具")
	}
}

// validateSource checks an input before selection and again before reading it.
func validateSource(path, kind string) (LocalSource, error) {
	extensions, limit, err := sourceRules(kind)
	if err != nil {
		return LocalSource{}, err
	}
	if !extensions[strings.ToLower(filepath.Ext(path))] {
		return LocalSource{}, errors.New("文件格式不受支持")
	}
	info, err := os.Stat(path)
	if err != nil {
		return LocalSource{}, err
	}
	if info.IsDir() || info.Size() < 1 || info.Size() > limit {
		return LocalSource{}, fmt.Errorf("%s 超过文件大小限制或为空", info.Name())
	}
	return LocalSource{Name: info.Name(), Path: path, Bytes: info.Size()}, nil
}

// ChooseFiles selects one or more source files and stores them per tool.
func (s *SourceFileService) ChooseFiles(kind string, multiple bool) ([]LocalSource, error) {
	if _, _, err := sourceRules(kind); err != nil {
		return nil, err
	}
	app := application.Get()
	if app == nil {
		return nil, errors.New("桌面窗口尚未就绪")
	}
	dialog := app.Dialog.OpenFile().SetTitle("选择源文件")
	if kind == "pdf-image" {
		dialog = dialog.AddFilter("PDF 文件", "*.pdf")
	} else {
		dialog = dialog.AddFilter("图片", "*.jpg;*.jpeg;*.png;*.webp")
	}
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
		return nil, errors.New("一次最多选择 50 个文件")
	}
	result := make([]LocalSource, 0, len(paths))
	for _, path := range paths {
		file, err := validateSource(path, kind)
		if err != nil {
			return nil, err
		}
		result = append(result, file)
	}
	s.mu.Lock()
	s.files[kind] = append([]string(nil), paths...)
	s.mu.Unlock()
	return result, nil
}

// ReadFileChunk returns at most two megabytes from one selected source.
func (s *SourceFileService) ReadFileChunk(kind string, index int, offset int64) (string, error) {
	s.mu.Lock()
	paths := append([]string(nil), s.files[kind]...)
	s.mu.Unlock()
	if index < 0 || index >= len(paths) {
		return "", errors.New("源文件序号无效")
	}
	info, err := validateSource(paths[index], kind)
	if err != nil {
		return "", err
	}
	if offset < 0 || offset >= info.Bytes {
		return "", errors.New("读取位置超出文件范围")
	}
	file, err := os.Open(paths[index])
	if err != nil {
		return "", err
	}
	defer file.Close()
	if _, err := file.Seek(offset, io.SeekStart); err != nil {
		return "", err
	}
	length := int64(2 * 1024 * 1024)
	if remaining := info.Bytes - offset; remaining < length {
		length = remaining
	}
	data := make([]byte, length)
	if _, err := io.ReadFull(file, data); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// sameSourceOutput chooses a collision-free output beside its input file.
func sameSourceOutput(sourcePath, suffix, extension string) (string, error) {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", errors.New("源文件路径无效")
	}
	stem := strings.TrimSuffix(info.Name(), filepath.Ext(info.Name()))
	base := stem + suffix
	dir := filepath.Dir(sourcePath)
	for number := 0; number < 10000; number++ {
		name := base + extension
		if number > 0 {
			name = fmt.Sprintf("%s_%d%s", base, number, extension)
		}
		path := filepath.Join(dir, name)
		if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
			return path, nil
		} else if err != nil {
			return "", err
		}
	}
	return "", errors.New("同名输出文件过多")
}
