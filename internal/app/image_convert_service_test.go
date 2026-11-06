package app

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeGradientPNG creates a PNG with transparency and a color gradient so
// JPEG quality differences are measurable.
func writeGradientPNG(t *testing.T, path string, width, height int) {
	t.Helper()
	canvas := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			canvas.Set(x, y, color.NRGBA{
				R: uint8((x * 255) / maxInt(1, width-1)),
				G: uint8((y * 255) / maxInt(1, height-1)),
				B: uint8(((x + y) * 127) / maxInt(1, width+height-2)),
				A: 255,
			})
		}
	}
	// Leave the top-left corner fully transparent.
	canvas.Set(0, 0, color.NRGBA{})
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if err := png.Encode(file, canvas); err != nil {
		t.Fatal(err)
	}
}

// maxInt is a small helper for test image math.
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// newImageConvertService prepares a service with one generated image.
func newImageConvertService(t *testing.T, name string, width, height int) (*ImageConvertService, string) {
	t.Helper()
	dir := t.TempDir()
	source := filepath.Join(dir, name)
	writeGradientPNG(t, source, width, height)
	service := NewImageConvertService()
	service.files = []string{source}
	return service, source
}

// TestConvertImageToJPEG checks format, dimensions, and transparency flattening.
func TestConvertImageToJPEG(t *testing.T) {
	service, _ := newImageConvertService(t, "photo.png", 400, 200)
	result, err := service.ConvertImage(0, "jpeg", 90, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_转换.jpg") {
		t.Fatalf("output name = %s", filepath.Base(result.Path))
	}
	if result.Width != 400 || result.Height != 200 {
		t.Fatalf("size = %dx%d, want 400x200", result.Width, result.Height)
	}
	data, err := os.ReadFile(result.Path)
	if err != nil {
		t.Fatal(err)
	}
	if data[0] != 0xff || data[1] != 0xd8 {
		t.Fatal("输出不是有效的 JPEG")
	}
	decoded, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	// The transparent corner must be flattened to near white.
	red, green, blue, _ := decoded.At(0, 0).RGBA()
	if red>>8 < 230 || green>>8 < 230 || blue>>8 < 230 {
		t.Fatalf("透明区域未变白：%d,%d,%d", red>>8, green>>8, blue>>8)
	}
}

// TestConvertImageResize checks the long-edge downscale math.
func TestConvertImageResize(t *testing.T) {
	service, _ := newImageConvertService(t, "wide.png", 2000, 1000)
	result, err := service.ConvertImage(0, "png", 90, 1000)
	if err != nil {
		t.Fatal(err)
	}
	if result.Width != 1000 || result.Height != 500 {
		t.Fatalf("size = %dx%d, want 1000x500", result.Width, result.Height)
	}
	file, err := os.Open(result.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	config, err := png.DecodeConfig(file)
	if err != nil || config.Width != 1000 || config.Height != 500 {
		t.Fatalf("decoded size = %v (err %v), want 1000x500", config, err)
	}
}

// TestConvertImageKeepsAlpha verifies PNG output preserves transparency.
func TestConvertImageKeepsAlpha(t *testing.T) {
	service, _ := newImageConvertService(t, "alpha.png", 120, 80)
	result, err := service.ConvertImage(0, "png", 90, 0)
	if err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(result.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	decoded, err := png.Decode(file)
	if err != nil {
		t.Fatal(err)
	}
	_, _, _, alpha := decoded.At(0, 0).RGBA()
	if alpha>>8 != 0 {
		t.Fatalf("透明像素 alpha = %d, want 0", alpha>>8)
	}
}

// TestConvertImageQualityAffectsSize checks that lower quality yields a smaller file.
func TestConvertImageQualityAffectsSize(t *testing.T) {
	service, _ := newImageConvertService(t, "gradient.png", 600, 400)
	low, err := service.ConvertImage(0, "jpeg", 30, 0)
	if err != nil {
		t.Fatal(err)
	}
	service.busy = false
	high, err := service.ConvertImage(0, "jpeg", 95, 0)
	if err != nil {
		t.Fatal(err)
	}
	if high.Bytes <= low.Bytes {
		t.Fatalf("质量 95 的文件 (%d) 未大于质量 30 (%d)", high.Bytes, low.Bytes)
	}
}

// TestConvertImageValidation covers format, quality, and size options.
func TestConvertImageValidation(t *testing.T) {
	service, _ := newImageConvertService(t, "photo.png", 60, 40)
	cases := []struct {
		name      string
		format    string
		quality   int
		dimension int
		wantPiece string
	}{
		{"bad format", "webp", 90, 0, "JPG 或 PNG"},
		{"low quality", "jpeg", 0, 0, "质量"},
		{"high quality", "jpeg", 101, 0, "质量"},
		{"bad dimension", "png", 90, 500, "最大边长"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := service.ConvertImage(0, tc.format, tc.quality, tc.dimension); err == nil || !strings.Contains(err.Error(), tc.wantPiece) {
				t.Fatalf("expected %q error, got %v", tc.wantPiece, err)
			}
		})
	}
}

// TestConvertImageMissingSource rejects a vanished file.
func TestConvertImageMissingSource(t *testing.T) {
	service := NewImageConvertService()
	service.files = []string{filepath.Join(t.TempDir(), "missing.png")}
	if _, err := service.ConvertImage(0, "png", 90, 0); err == nil {
		t.Fatal("expected source error")
	}
}

// TestConvertImageIndex checks index and busy guards.
func TestConvertImageIndex(t *testing.T) {
	service, _ := newImageConvertService(t, "photo.png", 40, 40)
	if _, err := service.ConvertImage(3, "png", 90, 0); err == nil || !strings.Contains(err.Error(), "序号无效") {
		t.Fatalf("expected index error, got %v", err)
	}
	service.busy = true
	if _, err := service.ConvertImage(0, "png", 90, 0); err == nil || !strings.Contains(err.Error(), "序号无效") {
		t.Fatalf("expected busy error, got %v", err)
	}
}

// TestConvertChooseWithoutWindow verifies the desktop dialog guard.
func TestConvertChooseWithoutWindow(t *testing.T) {
	if _, err := NewImageConvertService().ChooseImages(true); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}

// TestConvertSourceValidation covers the picker rules.
func TestConvertSourceValidation(t *testing.T) {
	dir := t.TempDir()
	good := filepath.Join(dir, "good.png")
	writeGradientPNG(t, good, 40, 40)
	if _, err := validateImageConvertSource(good); err != nil {
		t.Fatalf("valid image rejected: %v", err)
	}
	bad := filepath.Join(dir, "doc.pdf")
	if err := os.WriteFile(bad, []byte("%PDF"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := validateImageConvertSource(bad); err == nil || !strings.Contains(err.Error(), "格式") {
		t.Fatalf("expected format error, got %v", err)
	}
}
