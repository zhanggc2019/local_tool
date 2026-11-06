//go:build windows

package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// copySampleVideo writes the bundled sample into a fresh temp directory.
func copySampleVideo(t *testing.T) string {
	t.Helper()
	fixture, err := os.ReadFile(filepath.Join("..", "..", "testdata", "sample-video.mp4"))
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "sample-video.mp4")
	if err := os.WriteFile(source, fixture, 0600); err != nil {
		t.Fatal(err)
	}
	return source
}

// assertMP4 verifies a file looks like an MP4 container.
func assertMP4(t *testing.T, path string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 64 || !strings.Contains(string(data[4:32]), "ftyp") {
		t.Fatalf("%s 缺少 MP4 ftyp 文件头", path)
	}
}

// TestTrimVideoFast runs a lossless trim with the bundled FFmpeg.
func TestTrimVideoFast(t *testing.T) {
	source := copySampleVideo(t)
	service := NewVideoTrimService()
	service.files = []string{source}
	result, err := service.TrimVideo(0, 0, 500, "fast")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_剪辑.mp4") {
		t.Fatalf("输出命名异常：%s", result.Path)
	}
	if result.DurationMs != 500 {
		t.Fatalf("duration = %d, want 500", result.DurationMs)
	}
	assertMP4(t, result.Path)
}

// TestTrimVideoPrecise runs a re-encoding trim with the bundled FFmpeg.
func TestTrimVideoPrecise(t *testing.T) {
	source := copySampleVideo(t)
	service := NewVideoTrimService()
	service.files = []string{source}
	result, err := service.TrimVideo(0, 200, 900, "precise")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_剪辑.mp4") {
		t.Fatalf("输出命名异常：%s", result.Path)
	}
	if result.DurationMs != 700 {
		t.Fatalf("duration = %d, want 700", result.DurationMs)
	}
	assertMP4(t, result.Path)
}

// TestTrimVideoRejectsOverflow verifies the duration guard end to end.
func TestTrimVideoRejectsOverflow(t *testing.T) {
	source := copySampleVideo(t)
	service := NewVideoTrimService()
	service.files = []string{source}
	_, err := service.TrimVideo(0, 0, 60_000, "fast")
	if err == nil || !strings.Contains(err.Error(), "超出视频时长") {
		t.Fatalf("expected duration error, got %v", err)
	}
}

// TestCreateGIF exports a real GIF from the sample video.
func TestCreateGIF(t *testing.T) {
	source := copySampleVideo(t)
	service := NewVideoGIFService()
	service.files = []string{source}
	result, err := service.CreateGIF(0, 1000, 320, 10)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_GIF.gif") {
		t.Fatalf("输出命名异常：%s", result.Path)
	}
	data, err := os.ReadFile(result.Path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 64 || string(data[:4]) != "GIF8" {
		t.Fatalf("%s 缺少 GIF 文件头", result.Path)
	}
}

// TestCaptureFramesSingle grabs one frame at a timestamp.
func TestCaptureFramesSingle(t *testing.T) {
	source := copySampleVideo(t)
	service := NewVideoFrameService()
	service.files = []string{source}
	result, err := service.CaptureFrames("single", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 1 || len(result.Paths) != 1 {
		t.Fatalf("count = %d, paths = %v", result.Count, result.Paths)
	}
	if !strings.HasSuffix(result.Paths[0], "_截图.jpg") {
		t.Fatalf("输出命名异常：%s", result.Paths[0])
	}
	assertJPEG(t, result.Paths[0])
}

// TestCaptureFramesSpread grabs evenly spaced frames.
func TestCaptureFramesSpread(t *testing.T) {
	source := copySampleVideo(t)
	service := NewVideoFrameService()
	service.files = []string{source}
	result, err := service.CaptureFrames("spread", 0, 4)
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 4 {
		t.Fatalf("count = %d, want 4", result.Count)
	}
	for index, path := range result.Paths {
		wantSuffix := "_截图_" + string(rune('1'+index)) + ".jpg"
		if !strings.HasSuffix(filepath.Base(path), wantSuffix) {
			t.Fatalf("输出命名异常：%s，想以 %s 结尾", path, wantSuffix)
		}
		assertJPEG(t, path)
	}
}

// assertJPEG verifies a file starts with the JPEG magic bytes.
func assertJPEG(t *testing.T, path string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 256 || data[0] != 0xff || data[1] != 0xd8 {
		t.Fatalf("%s 缺少 JPEG 文件头", path)
	}
}
