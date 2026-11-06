package app

import (
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

// writeTestPNG creates one colored PNG with the given pixel size.
func writeTestPNG(t *testing.T, path string, width, height int, fill color.RGBA) {
	t.Helper()
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			canvas.Set(x, y, fill)
		}
	}
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if err := png.Encode(file, canvas); err != nil {
		t.Fatal(err)
	}
}

// writeTestJPEG creates one colored JPEG with the given pixel size.
func writeTestJPEG(t *testing.T, path string, width, height int) {
	t.Helper()
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			canvas.Set(x, y, color.RGBA{R: 40, G: 120, B: 190, A: 255})
		}
	}
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if err := jpeg.Encode(file, canvas, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
}

// newImagePDFServiceWithFiles prepares a service with generated test images.
func newImagePDFServiceWithFiles(t *testing.T, names ...string) (*ImagePDFService, []string) {
	t.Helper()
	dir := t.TempDir()
	var paths []string
	for _, name := range names {
		path := filepath.Join(dir, name)
		switch {
		case strings.HasSuffix(name, ".png"):
			writeTestPNG(t, path, 640, 320, color.RGBA{R: 200, G: 60, B: 60, A: 255})
		case strings.HasSuffix(name, ".webp"):
			// The extension is accepted for selection; a PNG body still verifies
			// that validation only checks the picker rules.
			writeTestPNG(t, path, 640, 320, color.RGBA{R: 60, G: 60, B: 200, A: 255})
		default:
			writeTestJPEG(t, path, 480, 600)
		}
		paths = append(paths, path)
	}
	service := NewImagePDFService()
	service.files = paths
	return service, paths
}

// TestImagePDFCreateBothModes checks page count, header, and naming.
func TestImagePDFCreateBothModes(t *testing.T) {
	for _, mode := range ImagePDFPageModes {
		t.Run(mode, func(t *testing.T) {
			service, paths := newImagePDFServiceWithFiles(t, "first.jpg", "second.png", "third.webp")
			result, err := service.CreatePDF([]int{0, 1, 2}, mode)
			if err != nil {
				t.Fatal(err)
			}
			if result.Count != 3 {
				t.Fatalf("pages = %d, want 3", result.Count)
			}
			wantName := strings.TrimSuffix(filepath.Base(paths[0]), ".jpg") + "_转PDF.pdf"
			if filepath.Base(result.Location) != wantName {
				t.Fatalf("output name = %s, want %s", filepath.Base(result.Location), wantName)
			}
			data, err := os.ReadFile(result.Location)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.HasPrefix(string(data), "%PDF-") {
				t.Fatal("输出不是有效的 PDF 文件")
			}
			pages, err := api.PageCountFile(result.Location)
			if err != nil || pages != 3 {
				t.Fatalf("page count = %d (err %v), want 3", pages, err)
			}
		})
	}
}

// TestImagePDFOriginalModePageOrder verifies the page sizes follow image order.
func TestImagePDFOriginalModePageOrder(t *testing.T) {
	dir := t.TempDir()
	wide := filepath.Join(dir, "wide.png")
	tall := filepath.Join(dir, "tall.png")
	writeTestPNG(t, wide, 900, 300, color.RGBA{R: 20, G: 90, B: 160, A: 255})
	writeTestPNG(t, tall, 300, 750, color.RGBA{R: 160, G: 90, B: 20, A: 255})
	service := NewImagePDFService()
	service.files = []string{wide, tall}

	result, err := service.CreatePDF([]int{1, 0}, "original")
	if err != nil {
		t.Fatal(err)
	}
	dims, err := api.PageDimsFile(result.Location)
	if err != nil || len(dims) != 2 {
		t.Fatalf("page dims failed: %v (%d pages)", err, len(dims))
	}
	// In original mode each page matches its image in pixel dimensions.
	if dims[0].Width != 300 || dims[0].Height != 750 {
		t.Fatalf("first page = %vx%v, want tall 300x750", dims[0].Width, dims[0].Height)
	}
	if dims[1].Width != 900 || dims[1].Height != 300 {
		t.Fatalf("second page = %vx%v, want wide 900x300", dims[1].Width, dims[1].Height)
	}
}

// TestImagePDFFitModeUsesA4 checks that fit mode emits A4 pages.
func TestImagePDFFitModeUsesA4(t *testing.T) {
	service, _ := newImagePDFServiceWithFiles(t, "only.png")
	result, err := service.CreatePDF([]int{0}, "fit")
	if err != nil {
		t.Fatal(err)
	}
	dims, err := api.PageDimsFile(result.Location)
	if err != nil || len(dims) != 1 {
		t.Fatalf("page dims failed: %v", err)
	}
	const a4Width, a4Height = 595.28, 841.89
	if dims[0].Width < a4Width-1 || dims[0].Width > a4Width+1 || dims[0].Height < a4Height-1 || dims[0].Height > a4Height+1 {
		t.Fatalf("page = %vx%v, want A4 595x842", dims[0].Width, dims[0].Height)
	}
}

// TestImagePDFOrderValidation rejects broken permutations.
func TestImagePDFOrderValidation(t *testing.T) {
	service, _ := newImagePDFServiceWithFiles(t, "a.png", "b.png", "c.png")
	cases := []struct {
		name  string
		order []int
	}{
		{"duplicate", []int{0, 1, 1}},
		{"out of range", []int{0, 1, 3}},
		{"negative", []int{-1, 1, 2}},
		{"wrong length", []int{0, 1}},
		{"empty", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := service.CreatePDF(tc.order, "fit"); err == nil || !strings.Contains(err.Error(), "顺序") {
				t.Fatalf("expected order error, got %v", err)
			}
		})
	}
}

// TestImagePDFModeValidation rejects unknown page modes.
func TestImagePDFModeValidation(t *testing.T) {
	service, _ := newImagePDFServiceWithFiles(t, "a.png")
	if _, err := service.CreatePDF([]int{0}, "a3"); err == nil || !strings.Contains(err.Error(), "页面布局") {
		t.Fatalf("expected mode error, got %v", err)
	}
}

// TestImagePDFWithoutSelection verifies the empty selection guard.
func TestImagePDFWithoutSelection(t *testing.T) {
	if _, err := NewImagePDFService().CreatePDF([]int{0}, "fit"); err == nil || !strings.Contains(err.Error(), "选择图片") {
		t.Fatalf("expected selection error, got %v", err)
	}
}

// TestImagePDFChooseWithoutWindow verifies the desktop dialog guard.
func TestImagePDFChooseWithoutWindow(t *testing.T) {
	if _, err := NewImagePDFService().ChooseImages(true); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}

// TestValidateImagePDFSource covers format and size checks.
func TestValidateImagePDFSource(t *testing.T) {
	dir := t.TempDir()
	good := filepath.Join(dir, "good.jpg")
	writeTestJPEG(t, good, 80, 60)
	if _, err := validateImagePDFSource(good); err != nil {
		t.Fatalf("valid image rejected: %v", err)
	}
	rejected := filepath.Join(dir, "note.txt")
	if err := os.WriteFile(rejected, []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := validateImagePDFSource(rejected); err == nil || !strings.Contains(err.Error(), "格式") {
		t.Fatalf("expected format error, got %v", err)
	}
	empty := filepath.Join(dir, "empty.png")
	if err := os.WriteFile(empty, nil, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := validateImagePDFSource(empty); err == nil || !strings.Contains(err.Error(), "为空") {
		t.Fatalf("expected empty error, got %v", err)
	}
}
