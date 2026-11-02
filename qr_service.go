package main

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	_ "image/png"
	"path/filepath"
	"strings"
	"sync"

	"example.com/pdf-desktop/internal/imagefile"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// QRCodeService saves locally generated QR codes through native dialogs.
type QRCodeService struct {
	mu         sync.Mutex
	lastOutput string
}

// NewQRCodeService creates an independent service for QR code exports.
func NewQRCodeService() *QRCodeService { return &QRCodeService{} }

// decodeQRCodePNG checks the encoded image size, format, and dimensions.
func decodeQRCodePNG(encoded string) ([]byte, error) {
	const prefix = "data:image/png;base64,"
	if !strings.HasPrefix(encoded, prefix) {
		return nil, errors.New("二维码图片格式无效")
	}
	if len(encoded) > 8*1024*1024 {
		return nil, errors.New("二维码图片超过大小限制")
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(encoded, prefix))
	if err != nil {
		return nil, errors.New("二维码图片编码无效")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || format != "png" {
		return nil, errors.New("二维码 PNG 无法读取")
	}
	if config.Width != config.Height || (config.Width != 512 && config.Width != 1024 && config.Width != 2048) {
		return nil, errors.New("二维码尺寸无效")
	}
	return data, nil
}

// SaveQRCode validates a PNG and lets the user choose its output path.
func (s *QRCodeService) SaveQRCode(encoded string) (string, error) {
	data, err := decodeQRCodePNG(encoded)
	if err != nil {
		return "", err
	}
	app := application.Get()
	if app == nil {
		return "", errors.New("桌面窗口尚未就绪")
	}
	path, err := app.Dialog.SaveFile().SetMessage("保存二维码").SetFilename("网址二维码.png").AddFilter("PNG 图片", "*.png").PromptForSingleSelection()
	if err != nil || path == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(path), ".png") {
		path += ".png"
	}
	if err := imagefile.WriteAtomic(path, data); err != nil {
		return "", fmt.Errorf("保存二维码失败：%w", err)
	}
	s.mu.Lock()
	s.lastOutput = filepath.Dir(path)
	s.mu.Unlock()
	return path, nil
}

// OpenQRCodeOutputFolder opens the latest saved QR code directory.
func (s *QRCodeService) OpenQRCodeOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已保存的二维码")
	}
	return application.Get().Env.OpenFileManager(path, false)
}
