//go:build windows

package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCompressVideoWithBundledFFmpeg runs a real compression on the sample video.
func TestCompressVideoWithBundledFFmpeg(t *testing.T) {
	fixture, err := os.ReadFile(filepath.Join("..", "..", "testdata", "sample-video.mp4"))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "sample-video.mp4")
	if err := os.WriteFile(source, fixture, 0600); err != nil {
		t.Fatal(err)
	}
	service := NewVideoCompressService()
	service.files = []string{source}
	result, err := service.CompressVideo(0, "half")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_压缩.mp4") {
		t.Fatalf("输出命名异常：%s", result.Path)
	}
	if result.InputBytes != int64(len(fixture)) {
		t.Fatalf("输入大小异常：%d", result.InputBytes)
	}
	if result.Bytes < 1024 {
		t.Fatalf("输出过小：%d bytes", result.Bytes)
	}
	data, err := os.ReadFile(result.Path)
	if err != nil {
		t.Fatal(err)
	}
	// A valid MP4 starts with a size-prefixed ftyp box containing "ftyp".
	if !strings.Contains(string(data[4:32]), "ftyp") {
		t.Fatal("输出缺少 MP4 ftyp 文件头")
	}
	head, tail := data, data
	if len(head) > 2048 {
		head = head[:2048]
		tail = data[len(data)-2048:]
	}
	if !strings.Contains(string(head), "moov") && !strings.Contains(string(tail), "moov") {
		t.Fatal("输出缺少 MP4 moov 数据")
	}
}
