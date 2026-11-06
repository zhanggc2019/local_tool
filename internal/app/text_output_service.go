package app

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"

	"example.com/pdf-desktop/internal/imagefile"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// textOutputKinds maps a purpose to its suffix and extension.
var textOutputKinds = map[string]struct {
	suffix    string
	extension string
}{
	"pdf-text": {suffix: "_文本", extension: ".txt"},
}

// TextOutputService saves extracted text beside its source file.
type TextOutputService struct {
	mu         sync.Mutex
	lastOutput string
}

// NewTextOutputService creates the shared text save service.
func NewTextOutputService() *TextOutputService { return &TextOutputService{} }

// SaveTextBesideSource validates extracted text and writes it as UTF-8 with BOM.
func (s *TextOutputService) SaveTextBesideSource(sourcePath, kind, text string) (string, error) {
	spec, ok := textOutputKinds[kind]
	if !ok {
		return "", errors.New("未知的文本输出类型")
	}
	if strings.TrimSpace(text) == "" {
		return "", errors.New("没有可保存的文本内容")
	}
	if len(text) > 20*1024*1024 {
		return "", errors.New("文本超过 20 MB 限制")
	}
	if _, err := validateSource(sourcePath, "pdf-text"); err != nil {
		return "", err
	}
	path, err := sameSourceOutput(sourcePath, spec.suffix, spec.extension)
	if err != nil {
		return "", err
	}
	// The BOM keeps Windows Notepad and spreadsheet tools on UTF-8.
	data := append([]byte{0xEF, 0xBB, 0xBF}, []byte(text)...)
	if err := imagefile.WriteAtomic(path, data); err != nil {
		return "", fmt.Errorf("保存失败：%w", err)
	}
	s.mu.Lock()
	s.lastOutput = filepath.Dir(path)
	s.mu.Unlock()
	return path, nil
}

// OpenTextOutputFolder opens the latest text output location.
func (s *TextOutputService) OpenTextOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已保存的文本")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(path, false)
}
