// Package photoexport validates standard ID photo images and sets print density.
package photoexport

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image/jpeg"
	"image/png"
	"strings"
)

const maxPhotoBytes = 8 << 20

// pngPixelsPerMeter is 300 DPI expressed in pixels per metre.
const pngPixelsPerMeter = 11811

// Spec describes the physical and pixel size of one ID photo preset at 300 DPI.
type Spec struct {
	Label  string
	Width  int
	Height int
	MMWide int
	MMHigh int
}

// SizeSpec returns the supported one-inch or two-inch preset.
func SizeSpec(size string) (Spec, error) {
	switch size {
	case "one":
		return Spec{Label: "1寸", Width: 295, Height: 413, MMWide: 25, MMHigh: 35}, nil
	case "two":
		return Spec{Label: "2寸", Width: 413, Height: 579, MMWide: 35, MMHigh: 49}, nil
	default:
		return Spec{}, errors.New("不支持的证件照尺寸")
	}
}

// ColorLabel validates a solid ID photo background choice.
func ColorLabel(color string) (string, error) {
	switch color {
	case "blue":
		return "蓝底", nil
	case "red":
		return "红底", nil
	case "white":
		return "白底", nil
	default:
		return "", errors.New("不支持的背景颜色")
	}
}

// DecodeJPEG validates image dimensions and writes 300 DPI JFIF metadata.
func DecodeJPEG(encoded string, spec Spec) ([]byte, error) {
	if len(encoded) > base64.StdEncoding.EncodedLen(maxPhotoBytes) {
		return nil, errors.New("证件照文件过大")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 || len(data) > maxPhotoBytes {
		return nil, errors.New("证件照数据无效")
	}
	config, err := jpeg.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width != spec.Width || config.Height != spec.Height {
		return nil, errors.New("证件照尺寸与所选规格不匹配")
	}
	return setJFIFDensity(data), nil
}

// setJFIFDensity updates or inserts the JPEG density marker for 300 DPI printing.
func setJFIFDensity(data []byte) []byte {
	if len(data) < 4 || data[0] != 0xff || data[1] != 0xd8 {
		return data
	}
	for position := 2; position+16 <= len(data) && data[position] == 0xff; {
		marker := data[position+1]
		if marker == 0xda || marker == 0xd9 {
			break
		}
		length := int(data[position+2])<<8 | int(data[position+3])
		if length < 2 || position+2+length > len(data) {
			break
		}
		if marker == 0xe0 && length >= 16 && string(data[position+4:position+9]) == "JFIF\x00" {
			data[position+11] = 1
			data[position+12], data[position+13] = 1, 44
			data[position+14], data[position+15] = 1, 44
			return data
		}
		position += 2 + length
	}
	app0 := []byte{0xff, 0xe0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x02, 0x01, 0x01, 0x2c, 0x01, 0x2c, 0x00, 0x00}
	return append(append([]byte{}, data[:2]...), append(app0, data[2:]...)...)
}

// DecodePNG validates PNG dimensions and writes 300 DPI pHYs metadata.
func DecodePNG(encoded string, spec Spec) ([]byte, error) {
	if len(encoded) > base64.StdEncoding.EncodedLen(maxPhotoBytes) {
		return nil, errors.New("证件照文件过大")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 || len(data) > maxPhotoBytes {
		return nil, errors.New("证件照数据无效")
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width != spec.Width || config.Height != spec.Height {
		return nil, errors.New("证件照尺寸与所选规格不匹配")
	}
	return setPNGDensity(data)
}

// setPNGDensity inserts a 300 DPI pHYs chunk directly after IHDR, replacing
// any existing density chunk so the image keeps a single pHYs entry.
func setPNGDensity(data []byte) ([]byte, error) {
	const signature = "\x89PNG\r\n\x1a\n"
	// Signature (8) + IHDR chunk (length 4 + type 4 + data 13 + CRC 4).
	const ihdrEnd = 33
	if len(data) < ihdrEnd || !bytes.Equal(data[:8], []byte(signature)) || string(data[12:16]) != "IHDR" {
		return nil, errors.New("证件照数据不是有效的 PNG")
	}
	chunk := make([]byte, 4+4+9+4)
	binary.BigEndian.PutUint32(chunk[0:4], 9)
	copy(chunk[4:8], "pHYs")
	binary.BigEndian.PutUint32(chunk[8:12], pngPixelsPerMeter)
	binary.BigEndian.PutUint32(chunk[12:16], pngPixelsPerMeter)
	chunk[16] = 1 // unit: metre
	binary.BigEndian.PutUint32(chunk[17:21], crc32.ChecksumIEEE(chunk[4:17]))

	output := make([]byte, 0, len(data)+len(chunk))
	output = append(output, data[:ihdrEnd]...)
	output = append(output, chunk...)
	for position := ihdrEnd; position+12 <= len(data); {
		length := int(binary.BigEndian.Uint32(data[position : position+4]))
		end := position + 12 + length
		if end > len(data) {
			output = append(output, data[position:]...)
			return output, nil
		}
		if string(data[position+4:position+8]) != "pHYs" {
			output = append(output, data[position:end]...)
		}
		position = end
	}
	return output, nil
}

// DefaultFilename creates a predictable name for a selected size and color.
func DefaultFilename(spec Spec, colorLabel string) string {
	return strings.Join([]string{"证件照", spec.Label, colorLabel}, "_") + ".jpg"
}
