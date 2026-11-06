package app

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"example.com/pdf-desktop/internal/imagefile"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ImageConvertResult summarizes one converted image.
type ImageConvertResult struct {
	Path       string `json:"path"`
	Bytes      int64  `json:"bytes"`
	InputBytes int64  `json:"inputBytes"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
}

// imageConvertMaxPixels bounds decoded input and output sizes.
const imageConvertMaxPixels = 40_000_000

// imageConvertDimensions lists the selectable maximum long edges; 0 keeps the original.
var imageConvertDimensions = []int{0, 1000, 1400, 2000}

// validateImageConvertChoice checks the conversion options from the interface.
func validateImageConvertChoice(format string, quality, maxDimension int) error {
	if format != "jpeg" && format != "png" {
		return errors.New("请选择 JPG 或 PNG 输出格式")
	}
	if quality < 1 || quality > 100 {
		return errors.New("图片质量需在 1–100 之间")
	}
	for _, candidate := range imageConvertDimensions {
		if candidate == maxDimension {
			return nil
		}
	}
	return errors.New("请选择图片最大边长")
}

// ImageConvertService stores one batch selection and the latest output.
type ImageConvertService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewImageConvertService creates the native batch image conversion service.
func NewImageConvertService() *ImageConvertService { return &ImageConvertService{} }

// validateImageConvertSource checks one image chosen for conversion.
func validateImageConvertSource(path string) (LocalSource, error) {
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

// ChooseImages selects one or up to 50 images for conversion.
func (s *ImageConvertService) ChooseImages(multiple bool) ([]LocalSource, error) {
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
		file, err := validateImageConvertSource(path)
		if err != nil {
			return nil, fmt.Errorf("%s：%w", filepath.Base(path), err)
		}
		result = append(result, file)
	}
	s.mu.Lock()
	s.files = append([]string(nil), paths...)
	s.lastOutput = ""
	s.mu.Unlock()
	return result, nil
}

// decodeImageGuarded decodes one image while enforcing the pixel limit.
func decodeImageGuarded(path string) (image.Image, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	config, _, err := image.DecodeConfig(file)
	if err != nil {
		return nil, fmt.Errorf("无法读取图片：%w", err)
	}
	if config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > imageConvertMaxPixels {
		return nil, errors.New("图片像素过大，无法处理")
	}
	if _, err := file.Seek(0, 0); err != nil {
		return nil, err
	}
	decoded, _, err := image.Decode(file)
	if err != nil {
		return nil, fmt.Errorf("无法解码图片：%w", err)
	}
	return decoded, nil
}

// resizeLongestEdge scales an image down so its longest edge fits the limit.
func resizeLongestEdge(source image.Image, maxDimension int) image.Image {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	longest := width
	if height > longest {
		longest = height
	}
	if maxDimension <= 0 || longest <= maxDimension {
		return source
	}
	scale := float64(maxDimension) / float64(longest)
	targetWidth := int(float64(width)*scale + 0.5)
	targetHeight := int(float64(height)*scale + 0.5)
	if targetWidth < 1 {
		targetWidth = 1
	}
	if targetHeight < 1 {
		targetHeight = 1
	}
	destination := image.NewRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	draw.CatmullRom.Scale(destination, destination.Bounds(), source, bounds, draw.Src, nil)
	return destination
}

// flattenOnWhite replaces transparency with a white background for JPEG.
func flattenOnWhite(source image.Image) image.Image {
	bounds := source.Bounds()
	destination := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	draw.Draw(destination, destination.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.Draw(destination, destination.Bounds(), source, bounds.Min, draw.Over)
	return destination
}

// encodeConvertedImage serializes one image in the requested format.
func encodeConvertedImage(source image.Image, format string, quality int) ([]byte, error) {
	var buffer bytes.Buffer
	switch format {
	case "jpeg":
		if err := jpeg.Encode(&buffer, flattenOnWhite(source), &jpeg.Options{Quality: quality}); err != nil {
			return nil, err
		}
	case "png":
		if err := png.Encode(&buffer, source); err != nil {
			return nil, err
		}
	default:
		return nil, errors.New("不支持的输出格式")
	}
	if buffer.Len() == 0 || buffer.Len() > 200*1024*1024 {
		return nil, errors.New("输出图片为空或超过 200 MB")
	}
	return buffer.Bytes(), nil
}

// ConvertImage converts one selected image beside its source file.
func (s *ImageConvertService) ConvertImage(index int, format string, quality, maxDimension int) (ImageConvertResult, error) {
	if err := validateImageConvertChoice(format, quality, maxDimension); err != nil {
		return ImageConvertResult{}, err
	}
	s.mu.Lock()
	if s.busy || index < 0 || index >= len(s.files) {
		s.mu.Unlock()
		return ImageConvertResult{}, errors.New("图片序号无效或已有任务在运行")
	}
	s.busy = true
	source := s.files[index]
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()
	input, err := validateImageConvertSource(source)
	if err != nil {
		return ImageConvertResult{}, err
	}
	decoded, err := decodeImageGuarded(source)
	if err != nil {
		return ImageConvertResult{}, err
	}
	converted := resizeLongestEdge(decoded, maxDimension)
	data, err := encodeConvertedImage(converted, format, quality)
	if err != nil {
		return ImageConvertResult{}, err
	}
	extension := ".png"
	if format == "jpeg" {
		extension = ".jpg"
	}
	output, err := sameSourceOutput(source, "_转换", extension)
	if err != nil {
		return ImageConvertResult{}, err
	}
	if err := imagefile.WriteAtomic(output, data); err != nil {
		return ImageConvertResult{}, fmt.Errorf("保存失败：%w", err)
	}
	info, err := os.Stat(output)
	if err != nil {
		return ImageConvertResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	bounds := converted.Bounds()
	return ImageConvertResult{Path: output, Bytes: info.Size(), InputBytes: input.Bytes, Width: bounds.Dx(), Height: bounds.Dy()}, nil
}

// OpenImageConvertOutputFolder opens the latest output directory.
func (s *ImageConvertService) OpenImageConvertOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已转换的图片")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
