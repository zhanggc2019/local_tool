package photoexport

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/jpeg"
	"image/png"
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

// makePNG creates an in-memory PNG for format and DPI checks.
func makePNG(t *testing.T, width, height int) string {
	t.Helper()
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, image.NewRGBA(image.Rect(0, 0, width, height))); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes())
}

// pngDensity reads the pHYs chunk and verifies its CRC.
func pngDensity(t *testing.T, data []byte) (uint32, uint32) {
	t.Helper()
	for position := 8; position+12 <= len(data); {
		length := int(binary.BigEndian.Uint32(data[position : position+4]))
		end := position + 12 + length
		if end > len(data) {
			break
		}
		if string(data[position+4:position+8]) == "pHYs" {
			if length != 9 {
				t.Fatalf("pHYs length = %d, want 9", length)
			}
			want := binary.BigEndian.Uint32(data[end-4 : end])
			got := crc32.ChecksumIEEE(data[position+4 : end-4])
			if want != got {
				t.Fatalf("pHYs CRC = %d, want %d", want, got)
			}
			return binary.BigEndian.Uint32(data[position+8 : position+12]), binary.BigEndian.Uint32(data[position+12 : position+16])
		}
		position = end
	}
	t.Fatal("PNG has no pHYs chunk")
	return 0, 0
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
	for _, color := range []string{"blue", "red", "white"} {
		if _, err := ColorLabel(color); err != nil {
			t.Fatalf("%s rejected: %v", color, err)
		}
	}
	if label, err := ColorLabel("white"); err != nil || label != "白底" {
		t.Fatalf("white label = %q (err %v)", label, err)
	}
	if _, err := ColorLabel("green"); err == nil {
		t.Fatal("invalid background accepted")
	}
}

// TestDecodePNG validates dimensions and the 300 DPI pHYs chunk.
func TestDecodePNG(t *testing.T) {
	spec, _ := SizeSpec("one")
	data, err := DecodePNG(makePNG(t, spec.Width, spec.Height), spec)
	if err != nil {
		t.Fatal(err)
	}
	x, y := pngDensity(t, data)
	if x != pngPixelsPerMeter || y != pngPixelsPerMeter {
		t.Fatalf("pHYs density = %d/%d, want %d", x, y, pngPixelsPerMeter)
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width != spec.Width || config.Height != spec.Height {
		t.Fatalf("decoded PNG = %+v (err %v)", config, err)
	}
	if _, err := DecodePNG(makePNG(t, 100, 100), spec); err == nil {
		t.Fatal("wrong dimensions accepted")
	}
	if _, err := DecodePNG(makeJPEG(t, spec.Width, spec.Height), spec); err == nil {
		t.Fatal("JPEG payload accepted as PNG")
	}
	if _, err := DecodePNG("invalid", spec); err == nil {
		t.Fatal("invalid image accepted")
	}
}

// TestSetPNGDensityReplacesExisting avoids duplicate pHYs chunks.
func TestSetPNGDensityReplacesExisting(t *testing.T) {
	spec, _ := SizeSpec("one")
	first, err := DecodePNG(makePNG(t, spec.Width, spec.Height), spec)
	if err != nil {
		t.Fatal(err)
	}
	second, err := setPNGDensity(first)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Count(second, []byte("pHYs")) != 1 {
		t.Fatalf("pHYs chunks = %d, want 1", bytes.Count(second, []byte("pHYs")))
	}
	if _, err := setPNGDensity([]byte("not a png")); err == nil {
		t.Fatal("invalid PNG accepted")
	}
}
