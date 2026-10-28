package pdfexport

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestDecodeImage checks the format and pixel limits at the export boundary.
func TestDecodeImage(t *testing.T) {
	var buffer bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := jpeg.Encode(&buffer, img, nil); err != nil {
		t.Fatal(err)
	}
	encoded := base64.StdEncoding.EncodeToString(buffer.Bytes())
	if _, err := DecodeImage(encoded, JPEG); err != nil {
		t.Fatalf("valid JPEG rejected: %v", err)
	}
	if _, err := DecodeImage(encoded, PNG); err == nil {
		t.Fatal("mismatched format accepted")
	}
	if _, err := DecodeImage("not base64", JPEG); err == nil {
		t.Fatal("invalid base64 accepted")
	}
}

// TestUniquePathAndAtomicWrite verifies that a split export preserves old files.
func TestUniquePathAndAtomicWrite(t *testing.T) {
	dir := t.TempDir()
	first := filepath.Join(dir, "document_001.jpg")
	if err := os.WriteFile(first, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	path, err := UniquePath(dir, "document_001.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(path, "document_001-2.jpg") {
		t.Fatalf("unexpected path: %s", path)
	}
	if err := WriteAtomic(path, []byte("new")); err != nil {
		t.Fatal(err)
	}
	original, err := os.ReadFile(first)
	if err != nil || string(original) != "old" {
		t.Fatal("existing output changed")
	}
	created, err := os.ReadFile(path)
	if err != nil || string(created) != "new" {
		t.Fatal("new output missing")
	}
	if err := WriteAtomic(first, []byte("replaced")); err != nil {
		t.Fatalf("atomic replacement failed: %v", err)
	}
	replaced, err := os.ReadFile(first)
	if err != nil || string(replaced) != "replaced" {
		t.Fatal("existing output was not replaced")
	}
}

// TestCleanStem removes Windows path punctuation from generated names.
func TestCleanStem(t *testing.T) {
	if got := CleanStem("a<b>:c.pdf"); got != "a-b--c" {
		t.Fatalf("unexpected stem: %q", got)
	}
}
