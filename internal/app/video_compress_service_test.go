package app

import (
	"path/filepath"
	"strings"
	"testing"
)

// TestParseDurationMillis covers the FFmpeg banner duration parser.
func TestParseDurationMillis(t *testing.T) {
	cases := []struct {
		name  string
		log   string
		want  int64
		valid bool
	}{
		{"plain seconds", "  Duration: 00:00:08.00, start: 0.000000", 8000, true},
		{"minutes and hours", "  Duration: 01:02:03.50, start: 0.000000", 3723500, true},
		{"zero duration is invalid", "  Duration: 00:00:00.00, start: 0.000000", 0, false},
		{"not available", "  Duration: N/A, start: 0.000000", 0, false},
		{"missing line", "Input #0, mov,mp4 from 'x.mp4':", 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseDurationMillis(tc.log)
			if ok != tc.valid {
				t.Fatalf("valid = %v, want %v", ok, tc.valid)
			}
			if ok && got != tc.want {
				t.Fatalf("duration = %d ms, want %d ms", got, tc.want)
			}
		})
	}
}

// TestComputeVideoKbps checks the bitrate math including audio and clamping.
func TestComputeVideoKbps(t *testing.T) {
	// 8 MB, 80 s, half size with audio: 8*1024*1024*8/80*0.5 = 419 kbps; minus 96 = 323.
	got := computeVideoKbps(8*1024*1024, 80000, true, 0.5)
	if got != 323 {
		t.Fatalf("video kbps = %d, want 323", got)
	}
	// Without audio the full budget stays with video.
	got = computeVideoKbps(8*1024*1024, 80000, false, 0.5)
	if got != 419 {
		t.Fatalf("video kbps = %d, want 419", got)
	}
	// Tiny targets clamp to the floor.
	if got = computeVideoKbps(50*1024, 80000, true, 0.2); got != compressMinVideoKbps {
		t.Fatalf("video kbps = %d, want floor %d", got, compressMinVideoKbps)
	}
	// Huge targets clamp to the ceiling.
	if got = computeVideoKbps(4*1024*1024*1024, 1000, false, 1.0); got != compressMaxVideoKbps {
		t.Fatalf("video kbps = %d, want ceiling %d", got, compressMaxVideoKbps)
	}
	// Invalid inputs fall back to the floor instead of failing.
	if got = computeVideoKbps(0, 0, false, 0.5); got != compressMinVideoKbps {
		t.Fatalf("video kbps = %d, want floor %d", got, compressMinVideoKbps)
	}
}

// TestBuildCompressArgs verifies the encoder flags for both audio cases.
func TestBuildCompressArgs(t *testing.T) {
	withAudio := buildCompressArgs("in.mp4", "out.mp4", 500, true)
	joined := strings.Join(withAudio, " ")
	for _, want := range []string{"libopenh264", "-rc_mode bitrate", "-b:v 500k", "-c:a aac", "-b:a 96k", "+faststart", "in.mp4", "out.mp4"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("args missing %q: %v", want, withAudio)
		}
	}
	withoutAudio := buildCompressArgs("in.mp4", "out.mp4", 500, false)
	joined = strings.Join(withoutAudio, " ")
	if strings.Contains(joined, "-c:a") || !strings.Contains(joined, "-an") {
		t.Fatalf("no-audio args wrong: %v", withoutAudio)
	}
}

// TestVideoCompressPresets ensures every preset has a sane target ratio.
func TestVideoCompressPresets(t *testing.T) {
	for _, id := range videoCompressPresetIDs() {
		preset, ok := videoCompressPresets[id]
		if !ok {
			t.Fatalf("preset id %q missing from map", id)
		}
		if preset.Label == "" || preset.TargetRatio <= 0 || preset.TargetRatio >= 1 {
			t.Fatalf("preset %q has invalid configuration: %+v", id, preset)
		}
	}
}

// TestCompressVideoValidation exercises error paths that need no FFmpeg.
func TestCompressVideoValidation(t *testing.T) {
	service := NewVideoCompressService()
	if _, err := service.CompressVideo(0, "super"); err == nil || !strings.Contains(err.Error(), "压缩强度") {
		t.Fatalf("expected preset error, got %v", err)
	}
	if _, err := service.CompressVideo(0, "half"); err == nil || !strings.Contains(err.Error(), "序号无效") {
		t.Fatalf("expected index error, got %v", err)
	}
	service.files = []string{filepath.Join(t.TempDir(), "missing.mp4")}
	if _, err := service.CompressVideo(0, "half"); err == nil {
		t.Fatal("expected source error for a missing video")
	}
}

// TestCompressChooseWithoutWindow verifies the desktop dialog guard.
func TestCompressChooseWithoutWindow(t *testing.T) {
	if _, err := NewVideoCompressService().ChooseVideos(false); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}

// TestCompressVideoBusyLocking ensures one compression at a time per service.
func TestCompressVideoBusyLocking(t *testing.T) {
	service := NewVideoCompressService()
	service.files = []string{filepath.Join(t.TempDir(), "sample.mp4")}
	service.busy = true
	if _, err := service.CompressVideo(0, "half"); err == nil || !strings.Contains(err.Error(), "序号无效") {
		t.Fatalf("expected busy error, got %v", err)
	}
}
