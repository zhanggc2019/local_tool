//go:build windows

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestVideoAudioFormats runs the bundled LGPL FFmpeg on a real video with audio.
func TestVideoAudioFormats(t *testing.T) {
	fixture, err := os.ReadFile(filepath.Join("testdata", "sample-video.mp4"))
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "sample-video.mp4")
	if err := os.WriteFile(source, fixture, 0600); err != nil {
		t.Fatal(err)
	}
	service := NewVideoAudioService()
	service.files = []string{source}
	for _, format := range []string{"mp3", "wav"} {
		t.Run(format, func(t *testing.T) {
			result, err := service.ExtractVideoAudio(0, format)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.HasSuffix(result.Path, "."+format) || result.Bytes < 128 {
				t.Fatalf("输出异常：%+v", result)
			}
			data, err := os.ReadFile(result.Path)
			if err != nil {
				t.Fatal(err)
			}
			if format == "wav" && string(data[:4]) != "RIFF" {
				t.Fatal("WAV 缺少 RIFF 文件头")
			}
			if format == "mp3" && string(data[:3]) != "ID3" && data[0] != 0xff {
				t.Fatal("MP3 缺少 MPEG 文件头")
			}
		})
	}
}
