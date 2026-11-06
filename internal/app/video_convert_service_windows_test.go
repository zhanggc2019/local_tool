//go:build windows

package app

import (
	"os"
	"strings"
	"testing"
)

// TestConvertVideoContainers converts the sample video into every target.
func TestConvertVideoContainers(t *testing.T) {
	cases := []struct {
		target string
		magic  string
	}{
		{"mp4", "ftyp"},
		{"mkv", "\x1a\x45\xdf\xa3"}, // EBML header
		{"webm", "\x1a\x45\xdf\xa3"},
	}
	for _, tc := range cases {
		t.Run(tc.target, func(t *testing.T) {
			source := copySampleVideo(t)
			service := NewVideoConvertService()
			service.files = []string{source}
			result, err := service.ConvertVideo(0, tc.target)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.HasSuffix(result.Path, "_转换."+tc.target) {
				t.Fatalf("输出命名异常：%s", result.Path)
			}
			data, err := os.ReadFile(result.Path)
			if err != nil {
				t.Fatal(err)
			}
			if len(data) < 64 {
				t.Fatalf("输出过小：%d bytes", len(data))
			}
			if !strings.Contains(string(data[:64]), tc.magic) {
				t.Fatalf("%s 输出缺少预期文件头 %q", tc.target, tc.magic)
			}
			if tc.target == "webm" && !strings.Contains(string(data[:256]), "webm") {
				t.Fatal("WebM 输出缺少 webm doctype")
			}
			if tc.target == "mkv" && !strings.Contains(string(data[:256]), "matroska") {
				t.Fatal("MKV 输出缺少 matroska doctype")
			}
		})
	}
}
