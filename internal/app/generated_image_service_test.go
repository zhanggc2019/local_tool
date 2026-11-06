package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestSaveGeneratedBothKinds writes watermark and stitch outputs beside a source.
func TestSaveGeneratedBothKinds(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "photo.png")
	if err := os.WriteFile(source, []byte("image-bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	service := NewGeneratedImageService()

	watermarkPath, err := service.SaveGeneratedBesideSource(source, "watermark", "png", encodeTestPNG(t, 120, 80))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(watermarkPath) != "photo_水印.png" {
		t.Fatalf("watermark name = %s", filepath.Base(watermarkPath))
	}

	stitchPath, err := service.SaveGeneratedBesideSource(source, "stitch", "jpeg", encodeTestJPEG(t, 200, 400))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(stitchPath) != "photo_长图.jpg" {
		t.Fatalf("stitch name = %s", filepath.Base(stitchPath))
	}
	data, err := os.ReadFile(stitchPath)
	if err != nil {
		t.Fatal(err)
	}
	if data[0] != 0xff || data[1] != 0xd8 {
		t.Fatal("长图输出不是有效的 JPEG")
	}
}

// TestSaveGeneratedCollision checks the collision-free naming loop.
func TestSaveGeneratedCollision(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "photo.png")
	if err := os.WriteFile(source, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "photo_水印.png"), []byte("taken"), 0600); err != nil {
		t.Fatal(err)
	}
	path, err := NewGeneratedImageService().SaveGeneratedBesideSource(source, "watermark", "png", encodeTestPNG(t, 40, 40))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(path) != "photo_水印_1.png" {
		t.Fatalf("second output name = %s", filepath.Base(path))
	}
}

// TestSaveGeneratedValidation covers kind, format, and payload errors.
func TestSaveGeneratedValidation(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "photo.png")
	if err := os.WriteFile(source, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	service := NewGeneratedImageService()
	cases := []struct {
		name  string
		kind  string
		arg   string
		data  string
		piece string
	}{
		{"unknown kind", "collage", "png", encodeTestPNG(t, 30, 30), "未知"},
		{"unknown format", "watermark", "webp", encodeTestPNG(t, 30, 30), "不支持"},
		{"bad base64", "watermark", "png", "!!!", "数据无效"},
		{"png as jpeg", "watermark", "jpeg", encodeTestPNG(t, 30, 30), "格式不符"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := service.SaveGeneratedBesideSource(source, tc.kind, tc.arg, tc.data); err == nil || !strings.Contains(err.Error(), tc.piece) {
				t.Fatalf("expected %q error, got %v", tc.piece, err)
			}
		})
	}
}

// TestSaveGeneratedMissingSource rejects vanished sources.
func TestSaveGeneratedMissingSource(t *testing.T) {
	service := NewGeneratedImageService()
	if _, err := service.SaveGeneratedBesideSource(filepath.Join(t.TempDir(), "missing.png"), "watermark", "png", encodeTestPNG(t, 20, 20)); err == nil {
		t.Fatal("expected source error")
	}
}

// TestGeneratedOpenWithoutOutput rejects opening before saving.
func TestGeneratedOpenWithoutOutput(t *testing.T) {
	if err := NewGeneratedImageService().OpenGeneratedOutputFolder(); err == nil || !strings.Contains(err.Error(), "还没有") {
		t.Fatal("expected empty-output error")
	}
}

// TestGeneratedSourceKinds checks the new picker kinds.
func TestGeneratedSourceKinds(t *testing.T) {
	for _, kind := range []string{"stamp", "stitch"} {
		extensions, limit, err := sourceRules(kind)
		if err != nil {
			t.Fatalf("kind %q missing: %v", kind, err)
		}
		if !extensions[".png"] || !extensions[".webp"] || limit != 20*1024*1024 {
			t.Fatalf("kind %q rules wrong: %v limit=%d", kind, extensions, limit)
		}
	}
}
