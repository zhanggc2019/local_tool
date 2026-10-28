package photoexport

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/jpeg"
	"testing"
)

// makeJPEG creates an in-memory image for format and DPI checks.
func makeJPEG(t *testing.T, width, height int) string {
	t.Helper()
	var buffer bytes.Buffer
	if err := jpeg.Encode(&buffer, image.NewRGBA(image.Rect(0, 0, width, height)), &jpeg.Options{Quality: 80}); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes())
}

// TestSizeSpec checks the common one-inch and two-inch output presets.
func TestSizeSpec(t *testing.T) {
	one, err := SizeSpec("one")
	if err != nil || one.Width != 295 || one.Height != 413 {
		t.Fatalf("one-inch preset: %+v, %v", one, err)
	}
	two, err := SizeSpec("two")
	if err != nil || two.Width != 413 || two.Height != 579 {
		t.Fatalf("two-inch preset: %+v, %v", two, err)
	}
	if _, err := SizeSpec("other"); err == nil {
		t.Fatal("invalid size accepted")
	}
}

// TestDecodeJPEG validates dimensions and the 300 DPI JFIF marker.
func TestDecodeJPEG(t *testing.T) {
	spec, _ := SizeSpec("one")
	data, err := DecodeJPEG(makeJPEG(t, spec.Width, spec.Height), spec)
	if err != nil {
		t.Fatal(err)
	}
	marker := []byte{'J', 'F', 'I', 'F', 0}
	index := bytes.Index(data, marker)
	if index < 0 || len(data) < index+12 || data[index+7] != 1 || data[index+8] != 1 || data[index+9] != 44 || data[index+10] != 1 || data[index+11] != 44 {
		t.Fatal("JPEG does not contain 300 DPI JFIF density")
	}
	if _, err := DecodeJPEG(makeJPEG(t, 100, 100), spec); err == nil {
		t.Fatal("wrong dimensions accepted")
	}
	if _, err := DecodeJPEG("invalid", spec); err == nil {
		t.Fatal("invalid image accepted")
	}
}

// TestColorLabel ensures only the supported backgrounds are exported.
func TestColorLabel(t *testing.T) {
	if _, err := ColorLabel("blue"); err != nil {
		t.Fatal(err)
	}
	if _, err := ColorLabel("red"); err != nil {
		t.Fatal(err)
	}
	if _, err := ColorLabel("green"); err == nil {
		t.Fatal("invalid background accepted")
	}
}
