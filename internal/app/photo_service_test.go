package app

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// photoJPEG returns a base64 JPEG of the requested pixel size.
func photoJPEG(t *testing.T, width, height int) string {
	t.Helper()
	var buffer bytes.Buffer
	if err := jpeg.Encode(&buffer, image.NewRGBA(image.Rect(0, 0, width, height)), &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes())
}

// photoPNG returns a base64 PNG of the requested pixel size.
func photoPNG(t *testing.T, width, height int) string {
	t.Helper()
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, image.NewRGBA(image.Rect(0, 0, width, height))); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes())
}

// newPhotoSource creates the source image that receives the exported photos.
func newPhotoSource(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "portrait.png")
	if err := os.WriteFile(path, []byte("source"), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

// TestSavePhotoWritesJPGAndPNG saves both formats with one shared base name.
func TestSavePhotoWritesJPGAndPNG(t *testing.T) {
	source := newPhotoSource(t)
	service := NewPhotoService()
	result, err := service.SavePhotoBesideSource(source, "one", "white", photoJPEG(t, 295, 413), photoPNG(t, 295, 413))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(result.JPG) != "portrait_证件照_1寸_白底.jpg" {
		t.Fatalf("jpg name = %s", filepath.Base(result.JPG))
	}
	if filepath.Base(result.PNG) != "portrait_证件照_1寸_白底.png" {
		t.Fatalf("png name = %s", filepath.Base(result.PNG))
	}
	if strings.TrimSuffix(result.JPG, ".jpg") != strings.TrimSuffix(result.PNG, ".png") {
		t.Fatalf("formats share no base name: %s / %s", result.JPG, result.PNG)
	}
	for _, path := range []string{result.JPG, result.PNG} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if len(data) < 128 {
			t.Fatalf("%s is too small", path)
		}
	}
	jpegData, _ := os.ReadFile(result.JPG)
	if jpegData[0] != 0xff || jpegData[1] != 0xd8 {
		t.Fatal("JPG output is not a JPEG")
	}
	pngData, _ := os.ReadFile(result.PNG)
	if !bytes.HasPrefix(pngData, []byte("\x89PNG\r\n\x1a\n")) {
		t.Fatal("PNG output is not a PNG")
	}
	if !bytes.Contains(pngData, []byte("pHYs")) {
		t.Fatal("PNG output lacks a pHYs density chunk")
	}
}

// TestSavePhotoSharedCollisionNumbersBothFiles keeps the two names in sync.
func TestSavePhotoSharedCollisionNumbersBothFiles(t *testing.T) {
	source := newPhotoSource(t)
	service := NewPhotoService()
	if _, err := service.SavePhotoBesideSource(source, "two", "blue", photoJPEG(t, 413, 579), photoPNG(t, 413, 579)); err != nil {
		t.Fatal(err)
	}
	second, err := service.SavePhotoBesideSource(source, "two", "blue", photoJPEG(t, 413, 579), photoPNG(t, 413, 579))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(second.JPG) != "portrait_证件照_2寸_蓝底_1.jpg" || filepath.Base(second.PNG) != "portrait_证件照_2寸_蓝底_1.png" {
		t.Fatalf("second pair = %s / %s", filepath.Base(second.JPG), filepath.Base(second.PNG))
	}
}

// TestSavePhotoSkipsHalfTakenBase avoids reusing a base with one file present.
func TestSavePhotoSkipsHalfTakenBase(t *testing.T) {
	source := newPhotoSource(t)
	taken := strings.TrimSuffix(source, ".png") + "_证件照_1寸_红底.jpg"
	if err := os.WriteFile(taken, []byte("taken"), 0600); err != nil {
		t.Fatal(err)
	}
	service := NewPhotoService()
	result, err := service.SavePhotoBesideSource(source, "one", "red", photoJPEG(t, 295, 413), photoPNG(t, 295, 413))
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(result.JPG) != "portrait_证件照_1寸_红底_1.jpg" || filepath.Base(result.PNG) != "portrait_证件照_1寸_红底_1.png" {
		t.Fatalf("pair = %s / %s", filepath.Base(result.JPG), filepath.Base(result.PNG))
	}
}

// TestSavePhotoRejectsMismatchedPNG writes nothing when either format is invalid.
func TestSavePhotoRejectsMismatchedPNG(t *testing.T) {
	source := newPhotoSource(t)
	service := NewPhotoService()
	before, _ := os.ReadDir(filepath.Dir(source))
	if _, err := service.SavePhotoBesideSource(source, "one", "white", photoJPEG(t, 295, 413), photoPNG(t, 200, 200)); err == nil {
		t.Fatal("mismatched PNG accepted")
	}
	after, _ := os.ReadDir(filepath.Dir(source))
	if len(after) != len(before) {
		t.Fatal("failed save left partial files behind")
	}
}

// TestSavePhotoRequiresWindowOnlyForDialog rejects the dialog path without a window.
func TestSavePhotoRequiresWindowOnlyForDialog(t *testing.T) {
	service := NewPhotoService()
	if _, err := service.SavePhoto("one", "white", photoJPEG(t, 295, 413), photoPNG(t, 295, 413)); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}

// TestPhotoOpenWithoutOutput rejects opening a folder before saving.
func TestPhotoOpenWithoutOutput(t *testing.T) {
	if err := NewPhotoService().OpenPhotoOutputFolder(); err == nil || !strings.Contains(err.Error(), "还没有") {
		t.Fatal("expected empty-output error")
	}
}
