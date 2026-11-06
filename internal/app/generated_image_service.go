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

// generatedImageKinds maps a purpose to its output filename suffix.
var generatedImageKinds = map[string]string{
	"watermark": "_水印",
	"stitch":    "_长图",
}

// generatedImageMaxPixels bounds outputs; long images need more than single photos.
const generatedImageMaxPixels = 32_000_000

// GeneratedImageService saves browser-rendered images beside their source.
type GeneratedImageService struct {
	mu         sync.Mutex
	lastOutput string
}

// NewGeneratedImageService creates the shared save service for canvas tools.
func NewGeneratedImageService() *GeneratedImageService { return &GeneratedImageService{} }

// generatedSuffix validates the purpose and returns its filename suffix.
func generatedSuffix(kind string) (string, error) {
	suffix, ok := generatedImageKinds[kind]
	if !ok {
		return "", errors.New("未知的图片输出类型")
	}
	return suffix, nil
}

// SaveGeneratedBesideSource validates one generated image and writes it atomically.
func (s *GeneratedImageService) SaveGeneratedBesideSource(sourcePath, kind, format, encoded string) (string, error) {
	suffix, err := generatedSuffix(kind)
	if err != nil {
		return "", err
	}
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
	if len(data) == 0 || len(data) > 160*1024*1024 {
		return "", errors.New("输出图片超过 160 MB 限制")
	}
	config, actual, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || actual != expected {
		return "", errors.New("输出图片无法读取或格式不符")
	}
	if config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > generatedImageMaxPixels {
		return "", errors.New("输出图片尺寸超出限制")
	}
	if _, err := validateSource(sourcePath, "cutout"); err != nil {
		return "", err
	}
	path, err := sameSourceOutput(sourcePath, suffix, extension)
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

// OpenGeneratedOutputFolder opens the latest generated image location.
func (s *GeneratedImageService) OpenGeneratedOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已保存的图片")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(path, false)
}
