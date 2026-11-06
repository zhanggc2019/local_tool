package app

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// encodeTestPNG returns base64 PNG data with a transparent corner pixel.
func encodeTestPNG(t *testing.T, width, height int) string {
	t.Helper()
	canvas := image.NewNRGBA(image.Rect(0, 0, width, height))
	canvas.Set(0, 0, color.NRGBA{R: 255, G: 0, B: 0, A: 128})
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, canvas); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes())
}

// encodeTestJPEG returns base64 JPEG data.
func encodeTestJPEG(t *testing.T, width, height int) string {
	t.Helper()
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			canvas.Set(x, y, color.RGBA{R: 90, G: 140, B: 60, A: 255})
		}
	}
	var buffer bytes.Buffer
	if err := jpeg.Encode(&buffer, canvas, &jpeg.Options{Quality: 88}); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes())
}

// TestSaveCutoutBothFormats writes real PNG and JPEG results beside a source.
func TestSaveCutoutBothFormats(t *testing.T) {
	dir := t.TempDir()
	pngSource := filepath.Join(dir, "portrait.png")
	if err := os.WriteFile(pngSource, []byte("png-bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	jpegSource := filepath.Join(dir, "portrait.jpg")
	if err := os.WriteFile(jpegSource, []byte("jpeg-bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	service := NewCutoutService()

	pngPath, err := service.SaveCutoutBesideSource(pngSource, "png", encodeTestPNG(t, 220, 160))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(pngPath) != "portrait_抠图.png" {
		t.Fatalf("png name = %s", filepath.Base(pngPath))
	}
	data, err := os.ReadFile(pngPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(data), "\x89PNG") {
		t.Fatal("输出不是有效的 PNG 文件")
	}

	jpegPath, err := service.SaveCutoutBesideSource(jpegSource, "jpeg", encodeTestJPEG(t, 220, 160))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(jpegPath) != "portrait_抠图.jpg" {
		t.Fatalf("jpeg name = %s", filepath.Base(jpegPath))
	}
	data, err = os.ReadFile(jpegPath)
	if err != nil {
		t.Fatal(err)
	}
	if data[0] != 0xff || data[1] != 0xd8 {
		t.Fatal("输出不是有效的 JPEG 文件")
	}
}

// TestSaveCutoutAvoidsOverwrite checks the collision-free naming loop.
func TestSaveCutoutAvoidsOverwrite(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "person.png")
	if err := os.WriteFile(source, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "person_抠图.png"), []byte("taken"), 0600); err != nil {
		t.Fatal(err)
	}
	service := NewCutoutService()
	path, err := service.SaveCutoutBesideSource(source, "png", encodeTestPNG(t, 40, 40))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(path) != "person_抠图_1.png" {
		t.Fatalf("second output name = %s", filepath.Base(path))
	}
}

// TestSaveCutoutValidation covers format and data errors.
func TestSaveCutoutValidation(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "person.png")
	if err := os.WriteFile(source, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	service := NewCutoutService()
	cases := []struct {
		name   string
		format string
		encode string
	}{
		{"unknown format", "webp", encodeTestPNG(t, 30, 30)},
		{"broken base64", "png", "!!!not-base64!!!"},
		{"png payload as jpeg", "jpeg", encodeTestPNG(t, 30, 30)},
		{"jpeg payload as png", "png", encodeTestJPEG(t, 30, 30)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := service.SaveCutoutBesideSource(source, tc.format, tc.encode); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

// TestSaveCutoutMissingSource rejects outputs whose source cannot be validated.
func TestSaveCutoutMissingSource(t *testing.T) {
	service := NewCutoutService()
	if _, err := service.SaveCutoutBesideSource(filepath.Join(t.TempDir(), "missing.png"), "png", encodeTestPNG(t, 30, 30)); err == nil {
		t.Fatal("expected source error")
	}
}

// TestCutoutSourceKind checks the shared picker rules for the cutout tool.
func TestCutoutSourceKind(t *testing.T) {
	dir := t.TempDir()
	valid := filepath.Join(dir, "photo.jpg")
	writeTestJPEG(t, valid, 100, 100)
	if _, err := validateSource(valid, "cutout"); err != nil {
		t.Fatalf("valid image rejected: %v", err)
	}
	invalid := filepath.Join(dir, "document.pdf")
	if err := os.WriteFile(invalid, []byte("%PDF-1.4"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := validateSource(invalid, "cutout"); err == nil || !strings.Contains(err.Error(), "格式") {
		t.Fatalf("expected format error, got %v", err)
	}
	if _, _, err := sourceRules("cutout"); err != nil {
		t.Fatalf("cutout kind missing from picker rules: %v", err)
	}
}

// TestCutoutOpenWithoutOutput rejects opening a folder before saving.
func TestCutoutOpenWithoutOutput(t *testing.T) {
	if err := NewCutoutService().OpenCutoutOutputFolder(); err == nil || !strings.Contains(err.Error(), "还没有") {
		t.Fatal("expected empty-output error")
	}
}
