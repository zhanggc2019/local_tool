package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"testing"
)

// TestDecodeQRCodePNG accepts valid output dimensions and rejects malformed data.
func TestDecodeQRCodePNG(t *testing.T) {
	imageData := image.NewRGBA(image.Rect(0, 0, 512, 512))
	imageData.Set(0, 0, color.Black)
	var output bytes.Buffer
	if err := png.Encode(&output, imageData); err != nil {
		t.Fatal(err)
	}
	encoded := "data:image/png;base64," + base64.StdEncoding.EncodeToString(output.Bytes())
	data, err := decodeQRCodePNG(encoded)
	if err != nil || !bytes.Equal(data, output.Bytes()) {
		t.Fatalf("valid QR PNG rejected: %v", err)
	}
	if _, err := decodeQRCodePNG("data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(output.Bytes())); err == nil {
		t.Fatal("JPEG prefix accepted")
	}
	if _, err := decodeQRCodePNG("data:image/png;base64,not-base64"); err == nil {
		t.Fatal("malformed base64 accepted")
	}
}
