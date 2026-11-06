package app

import (
	"path/filepath"
	"strings"
	"testing"
)

// TestValidateVideoConvertTarget covers the container whitelist.
func TestValidateVideoConvertTarget(t *testing.T) {
	for _, target := range VideoConvertTargets {
		if err := validateVideoConvertTarget(target); err != nil {
			t.Fatalf("target %q rejected: %v", target, err)
		}
	}
	for _, target := range []string{"avi", "mov", ""} {
		if err := validateVideoConvertTarget(target); err == nil || !strings.Contains(err.Error(), "输出格式") {
			t.Fatalf("target %q: expected error, got %v", target, err)
		}
	}
}

// TestBuildConvertArgs verifies every container strategy.
func TestBuildConvertArgs(t *testing.T) {
	copyArgs := strings.Join(buildConvertArgs("in.mp4", "out.mp4", "mp4", 2000, true), " ")
	for _, want := range []string{"-c copy", "+faststart", "-sn", "-dn"} {
		if !strings.Contains(copyArgs, want) {
			t.Fatalf("mp4 copy args missing %q: %s", want, copyArgs)
		}
	}
	transcodeArgs := strings.Join(buildConvertArgs("in.mov", "out.mp4", "mp4", 2000, true), " ")
	for _, want := range []string{"libopenh264", "-b:v 2000k", "-c:a aac", "-b:a 128k"} {
		if !strings.Contains(transcodeArgs, want) {
			t.Fatalf("mp4 transcode args missing %q: %s", want, transcodeArgs)
		}
	}
	if strings.Contains(transcodeArgs, "libopenh264") && strings.Contains(transcodeArgs, "-c:a aac") {
		// transcoding must not also copy streams
		if strings.Contains(transcodeArgs, "-c copy") {
			t.Fatalf("mp4 transcode args must not copy: %s", transcodeArgs)
		}
	}
	muteArgs := strings.Join(buildConvertArgs("in.avi", "out.mp4", "mp4", 2000, false), " ")
	if !strings.Contains(muteArgs, "-an") {
		t.Fatalf("no-audio mp4 args missing -an: %s", muteArgs)
	}
	mkvArgs := strings.Join(buildConvertArgs("in.mov", "out.mkv", "mkv", 2000, true), " ")
	if !strings.Contains(mkvArgs, "-c copy") {
		t.Fatalf("mkv args should copy streams: %s", mkvArgs)
	}
	webmArgs := strings.Join(buildConvertArgs("in.mp4", "out.webm", "webm", 2000, true), " ")
	for _, want := range []string{"libvpx-vp9", "-crf 32", "libopus", "-b:a 96k"} {
		if !strings.Contains(webmArgs, want) {
			t.Fatalf("webm args missing %q: %s", want, webmArgs)
		}
	}
	webmMuteArgs := strings.Join(buildConvertArgs("in.mp4", "out.webm", "webm", 2000, false), " ")
	if !strings.Contains(webmMuteArgs, "-an") {
		t.Fatalf("no-audio webm args missing -an: %s", webmMuteArgs)
	}
}

// TestConvertVideoValidation exercises error paths that need no FFmpeg.
func TestConvertVideoValidation(t *testing.T) {
	service := NewVideoConvertService()
	if _, err := service.ConvertVideo(0, "avi"); err == nil || !strings.Contains(err.Error(), "输出格式") {
		t.Fatalf("expected target error, got %v", err)
	}
	if _, err := service.ConvertVideo(0, "mp4"); err == nil || !strings.Contains(err.Error(), "序号无效") {
		t.Fatalf("expected index error, got %v", err)
	}
	service.files = []string{filepath.Join(t.TempDir(), "missing.mp4")}
	if _, err := service.ConvertVideo(0, "mp4"); err == nil {
		t.Fatal("expected source error for a missing video")
	}
}

// TestConvertVideoBusy checks the single-task lock.
func TestConvertVideoBusy(t *testing.T) {
	service := NewVideoConvertService()
	service.files = []string{filepath.Join(t.TempDir(), "sample.mp4")}
	service.busy = true
	if _, err := service.ConvertVideo(0, "mp4"); err == nil || !strings.Contains(err.Error(), "序号无效") {
		t.Fatalf("expected busy error, got %v", err)
	}
}

// TestVideoConvertChooseWithoutWindow verifies the desktop dialog guard.
func TestVideoConvertChooseWithoutWindow(t *testing.T) {
	if _, err := NewVideoConvertService().ChooseVideos(false); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}
