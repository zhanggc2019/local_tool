package app

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"path/filepath"
	"sync"

	"example.com/pdf-desktop/internal/imagefile"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// CutoutService saves locally generated cutout images beside their sources.
type CutoutService struct {
	mu         sync.Mutex
	lastOutput string
}

// NewCutoutService creates the independent cutout save service.
func NewCutoutService() *CutoutService { return &CutoutService{} }

// SaveCutoutBesideSource validates one generated cutout and writes it atomically.
func (s *CutoutService) SaveCutoutBesideSource(sourcePath, format, encoded string) (string, error) {
	extension, expected := ".png", "png"
	if format == "jpeg" {
		extension, expected = ".jpg", "jpeg"
	} else if format != "png" {
		return "", errors.New("不支持的图片格式")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", errors.New("图片数据无效")
	}
	if len(data) == 0 || len(data) > 80*1024*1024 {
		return "", errors.New("输出图片超过 80 MB 限制")
	}
	config, actual, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || actual != expected {
		return "", errors.New("输出图片无法读取或格式不符")
	}
	if config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > 16000000 {
		return "", errors.New("输出图片尺寸超出限制")
	}
	if _, err := validateSource(sourcePath, "cutout"); err != nil {
		return "", err
	}
	path, err := sameSourceOutput(sourcePath, "_抠图", extension)
	if err != nil {
		return "", err
	}
	if err := imagefile.WriteAtomic(path, data); err != nil {
		return "", fmt.Errorf("保存失败：%w", err)
	}
	s.mu.Lock()
	s.lastOutput = filepath.Dir(path)
	s.mu.Unlock()
	return path, nil
}

// OpenCutoutOutputFolder opens the latest cutout image location.
func (s *CutoutService) OpenCutoutOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已保存的抠图")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(path, false)
}
