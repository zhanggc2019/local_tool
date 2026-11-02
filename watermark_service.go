package main

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"example.com/pdf-desktop/internal/imagefile"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// WatermarkService saves locally repaired images through the native dialog.
type WatermarkService struct {
	mu         sync.Mutex
	lastOutput string
}

// NewWatermarkService creates an independent service for image repair.
func NewWatermarkService() *WatermarkService { return &WatermarkService{} }

// SaveRepairedImage validates the generated image and writes it atomically.
func (s *WatermarkService) SaveRepairedImage(filename, format, encoded string) (string, error) {
	return s.saveRepairedImage(filename, "", format, encoded)
}

// SaveRepairedImageBesideSource saves a repaired image beside its source.
func (s *WatermarkService) SaveRepairedImageBesideSource(sourcePath, format, encoded string) (string, error) {
	return s.saveRepairedImage(filepath.Base(sourcePath), sourcePath, format, encoded)
}

// saveRepairedImage validates image data and chooses its output path.
func (s *WatermarkService) saveRepairedImage(filename, sourcePath, format, encoded string) (string, error) {
	extension := ".png"
	mime := "data:image/png;base64,"
	if format == "jpeg" {
		extension, mime = ".jpg", "data:image/jpeg;base64,"
	} else if format != "png" {
		return "", errors.New("不支持的图片格式")
	}
	if !strings.HasPrefix(encoded, mime) {
		return "", errors.New("图片数据格式无效")
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(encoded, mime))
	if err != nil {
		return "", err
	}
	if len(data) == 0 || len(data) > 80*1024*1024 {
		return "", errors.New("输出图片超过 80 MB 限制")
	}
	config, actual, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || actual != format {
		return "", errors.New("输出图片无法读取或格式不符")
	}
	if config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > 16000000 {
		return "", errors.New("输出图片尺寸超出限制")
	}
	app := application.Get()
	if app == nil {
		return "", errors.New("桌面窗口尚未就绪")
	}
	stem := strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
	if stem == "" {
		stem = "图片"
	}
	var path string
	if sourcePath != "" {
		path, err = sameSourceOutput(sourcePath, "_修复", extension)
	} else {
		path, err = app.Dialog.SaveFile().SetMessage("保存修复图片").SetFilename(stem+"_修复"+extension).AddFilter("图片", "*"+extension).PromptForSingleSelection()
	}
	if err != nil || path == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(path), extension) {
		path += extension
	}
	if err = imagefile.WriteAtomic(path, data); err != nil {
		return "", fmt.Errorf("保存失败：%w", err)
	}
	s.mu.Lock()
	s.lastOutput = filepath.Dir(path)
	s.mu.Unlock()
	return path, nil
}

// OpenWatermarkOutputFolder opens the latest repaired image location.
func (s *WatermarkService) OpenWatermarkOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已保存的图片")
	}
	if _, err := os.Stat(path); err != nil {
		return err
	}
	return application.Get().Env.OpenFileManager(path, false)
}
