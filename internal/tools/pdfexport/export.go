// Package pdfexport validates and saves images produced by the PDF tool.
package pdfexport

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

	"example.com/pdf-desktop/internal/imagefile"
)

const maxImageBytes = 32 << 20
const maxPixels = 20_000_000
const maxSide = 16_000

// Format describes a supported image encoding and its file extension.
type Format string

const (
	JPEG Format = "jpeg"
	PNG  Format = "png"
)

// Extension returns the extension associated with a supported image format.
func (f Format) Extension() (string, error) {
	switch f {
	case JPEG:
		return ".jpg", nil
	case PNG:
		return ".png", nil
	default:
		return "", errors.New("不支持的图片格式")
	}
}

// CleanStem creates a filename stem without Windows-reserved punctuation.
func CleanStem(filename string) string {
	stem := strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
	stem = strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`<>:"/\|?*`, r) {
			return '-'
		}
		return r
	}, stem)
	stem = strings.Trim(stem, " .-")
	if stem == "" {
		return "转换结果"
	}
	if len([]rune(stem)) > 80 {
		stem = string([]rune(stem)[:80])
	}
	return stem
}

// DecodeImage checks base64 size, encoding, and dimensions before saving.
func DecodeImage(encoded string, expected Format) ([]byte, error) {
	if len(encoded) > base64.StdEncoding.EncodedLen(maxImageBytes) {
		return nil, errors.New("图片数据过大，请选择更小尺寸")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 || len(data) > maxImageBytes {
		return nil, errors.New("图片数据无效或过大")
	}
	config, actual, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || actual != string(expected) {
		return nil, errors.New("图片格式与导出设置不匹配")
	}
	if config.Width < 1 || config.Height < 1 || config.Width > maxSide || config.Height > maxSide || int64(config.Width)*int64(config.Height) > maxPixels {
		return nil, errors.New("图片尺寸超过安全上限，请降低宽度或改为按页导出")
	}
	return data, nil
}

// WriteAtomic writes an image through a temporary file in the target directory.
func WriteAtomic(path string, data []byte) error {
	return imagefile.WriteAtomic(path, data)
}

// UniquePath picks a path that does not overwrite an existing split image.
func UniquePath(dir, filename string) (string, error) {
	base := strings.TrimSuffix(filename, filepath.Ext(filename))
	ext := filepath.Ext(filename)
	for number := 1; number <= 9999; number++ {
		name := filename
		if number > 1 {
			name = fmt.Sprintf("%s-%d%s", base, number, ext)
		}
		path := filepath.Join(dir, name)
		_, err := os.Stat(path)
		if errors.Is(err, os.ErrNotExist) {
			return path, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", errors.New("输出目录中同名文件过多")
}
