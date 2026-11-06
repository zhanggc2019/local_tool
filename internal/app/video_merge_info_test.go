package app

import (
	"path/filepath"
	"strings"
	"testing"
)

// sampleBanner is a realistic FFmpeg banner for a 640x360 H.264/AAC video.
const sampleBanner = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'clip.mp4':
  Metadata:
    major_brand     : isom
  Duration: 00:00:08.00, start: 0.000000, bitrate: 2134 kb/s
  Stream #0:0[0x1](und): Video: h264 (Constrained Baseline) (avc1 / 0x31637661), yuv420p(progressive), 640x360 [SAR 1:1 DAR 16:9], 2001 kb/s, 24 fps, 24 tbr, 12288 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 126 kb/s (default)
`

// silentBanner has no audio stream.
const silentBanner = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'silent.mp4':
  Duration: 00:00:01.00, start: 0.000000, bitrate: 90 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 160x90 [SAR 1:1 DAR 16:9], 7 kb/s, 12 fps, 12 tbr, 12288 tbn (default)
`

// TestParseVideoStreamInfo covers duration, resolution, fps, and audio detection.
func TestParseVideoStreamInfo(t *testing.T) {
	info, err := parseVideoStreamInfo(sampleBanner)
	if err != nil {
		t.Fatal(err)
	}
	if info.DurationMs != 8000 {
		t.Fatalf("duration = %d, want 8000", info.DurationMs)
	}
	if info.Width != 640 || info.Height != 360 {
		t.Fatalf("size = %dx%d, want 640x360", info.Width, info.Height)
	}
	if info.FPS != 24 {
		t.Fatalf("fps = %v, want 24", info.FPS)
	}
	if !info.HasAudio {
		t.Fatal("audio not detected")
	}
	silent, err := parseVideoStreamInfo(silentBanner)
	if err != nil {
		t.Fatal(err)
	}
	if silent.HasAudio {
		t.Fatal("silent video reported audio")
	}
	if silent.Width != 160 || silent.Height != 90 || silent.FPS != 12 {
		t.Fatalf("silent stream = %+v", silent)
	}
}

// TestParseVideoStreamInfoErrors rejects unusable banners.
func TestParseVideoStreamInfoErrors(t *testing.T) {
	if _, err := parseVideoStreamInfo("Input #0, mp4, from 'x.mp4':\n"); err == nil || !strings.Contains(err.Error(), "时长") {
		t.Fatalf("expected duration error, got %v", err)
	}
	noVideo := "  Duration: 00:00:01.00, start: 0\n  Stream #0:1: Audio: aac, 44100 Hz, mono\n"
	if _, err := parseVideoStreamInfo(noVideo); err == nil || !strings.Contains(err.Error(), "画面") {
		t.Fatalf("expected video-stream error, got %v", err)
	}
	cases := []string{
		"  Duration: 00:00:01.00\n  Stream #0:0: Video: h264 (High), yuv420p\n",
	}
	for _, text := range cases {
		if _, err := parseVideoStreamInfo(text); err == nil || !strings.Contains(err.Error(), "分辨率") {
			t.Fatalf("expected resolution error, got %v", err)
		}
	}
}

// TestBuildConcatList escapes single quotes for the concat demuxer.
func TestBuildConcatList(t *testing.T) {
	list := buildConcatList([]string{`C:\videos\a.mp4`, `C:\videos\it's.mp4`})
	lines := strings.Split(strings.TrimSuffix(list, "\n"), "\n")
	if len(lines) != 2 {
		t.Fatalf("lines = %v", lines)
	}
	if lines[0] != `file 'C:\videos\a.mp4'` {
		t.Fatalf("line 0 = %q", lines[0])
	}
	if lines[1] != `file 'C:\videos\it'\''s.mp4'` {
		t.Fatalf("escaped line = %q", lines[1])
	}
}

// TestBuildMergeFilter normalizes inputs and supplies silence.
func TestBuildMergeFilter(t *testing.T) {
	infos := []videoStreamInfo{
		{DurationMs: 8000, Width: 640, Height: 360, FPS: 24, HasAudio: true},
		{DurationMs: 1000, Width: 160, Height: 90, FPS: 12, HasAudio: false},
	}
	filter := buildMergeFilter(infos, 640, 360, 24)
	for _, want := range []string{
		"[0:v]scale=640:360:force_original_aspect_ratio=decrease",
		"pad=640:360",
		"setsar=1",
		"fps=24",
		"[0:a]aresample=48000",
		"anullsrc=channel_layout=stereo:sample_rate=48000",
		"atrim=duration=1.000[a1]",
		"[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
	} {
		if !strings.Contains(filter, want) {
			t.Fatalf("filter missing %q:\n%s", want, filter)
		}
	}
}

// TestMergeOutputExtension picks a safe container per mode.
func TestMergeOutputExtension(t *testing.T) {
	if got := mergeOutputExtension("clip.mp4", "fast"); got != ".mp4" {
		t.Fatalf("fast mp4 = %q", got)
	}
	if got := mergeOutputExtension("clip.MOV", "fast"); got != ".mov" {
		t.Fatalf("fast mov = %q", got)
	}
	if got := mergeOutputExtension("clip.avi", "fast"); got != ".mkv" {
		t.Fatalf("fast avi = %q, want .mkv", got)
	}
	if got := mergeOutputExtension("clip.webm", "precise"); got != ".mp4" {
		t.Fatalf("precise = %q, want .mp4", got)
	}
}

// TestMergeVideosValidation covers mode, selection, order, and source checks.
func TestMergeVideosValidation(t *testing.T) {
	service := NewVideoMergeService()
	if _, err := service.MergeVideos([]int{0, 1}, "copy"); err == nil || !strings.Contains(err.Error(), "合并方式") {
		t.Fatalf("expected mode error, got %v", err)
	}
	if _, err := service.MergeVideos([]int{0, 1}, "fast"); err == nil || !strings.Contains(err.Error(), "至少两个视频") {
		t.Fatalf("expected selection error, got %v", err)
	}
	service.files = []string{"a.mp4"}
	if _, err := service.MergeVideos([]int{0}, "fast"); err == nil || !strings.Contains(err.Error(), "至少两个视频") {
		t.Fatalf("expected selection error, got %v", err)
	}
	service.files = []string{"a.mp4", "b.mp4"}
	if _, err := service.MergeVideos([]int{0}, "fast"); err == nil || !strings.Contains(err.Error(), "顺序") {
		t.Fatalf("expected order error, got %v", err)
	}
	if _, err := service.MergeVideos([]int{0, 0}, "fast"); err == nil || !strings.Contains(err.Error(), "顺序") {
		t.Fatalf("expected duplicate error, got %v", err)
	}
	if _, err := service.MergeVideos([]int{0, 2}, "fast"); err == nil || !strings.Contains(err.Error(), "顺序") {
		t.Fatalf("expected out-of-range error, got %v", err)
	}
	missing := filepath.Join(t.TempDir(), "missing.mp4")
	service.files = []string{missing, missing}
	if _, err := service.MergeVideos([]int{0, 1}, "fast"); err == nil {
		t.Fatal("expected source error")
	}
}

// TestMergeVideosBusy checks the single-task lock.
func TestMergeVideosBusy(t *testing.T) {
	service := NewVideoMergeService()
	service.files = []string{"a.mp4", "b.mp4"}
	service.busy = true
	if _, err := service.MergeVideos([]int{0, 1}, "fast"); err == nil || !strings.Contains(err.Error(), "已有合并任务") {
		t.Fatalf("expected busy error, got %v", err)
	}
}

// TestMergeChooseWithoutWindow verifies the desktop dialog guard.
func TestMergeChooseWithoutWindow(t *testing.T) {
	if _, err := NewVideoMergeService().ChooseVideos(true); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}

// TestParseVideoInfoOutput extracts container, streams, and bitrates.
func TestParseVideoInfoOutput(t *testing.T) {
	info := parseVideoInfoOutput("clip.mp4", sampleBanner)
	if info.Container != "mov" {
		t.Fatalf("container = %q, want mov", info.Container)
	}
	if info.DurationMs != 8000 || info.BitrateKbps != 2134 {
		t.Fatalf("duration/bitrate = %d/%d", info.DurationMs, info.BitrateKbps)
	}
	if info.VideoCodec != "h264" || info.Width != 640 || info.Height != 360 || info.FPS != 24 {
		t.Fatalf("video = %+v", info)
	}
	if info.VideoBitrateKbps != 2001 {
		t.Fatalf("video bitrate = %d, want 2001", info.VideoBitrateKbps)
	}
	if info.AudioCodec != "aac" || info.SampleRate != 44100 || info.Channels != "mono" || info.AudioBitrateKbps != 126 {
		t.Fatalf("audio = %+v", info)
	}
}

// TestParseVideoInfoOutputSilent leaves audio fields empty.
func TestParseVideoInfoOutputSilent(t *testing.T) {
	info := parseVideoInfoOutput("silent.mp4", silentBanner)
	if info.AudioCodec != "" || info.SampleRate != 0 || info.Channels != "" {
		t.Fatalf("audio fields should be empty: %+v", info)
	}
	if info.VideoCodec != "h264" || info.Width != 160 {
		t.Fatalf("video = %+v", info)
	}
}

// TestVideoInfoChooseWithoutWindow verifies the desktop dialog guard.
func TestVideoInfoChooseWithoutWindow(t *testing.T) {
	if _, err := NewVideoInfoService().ChooseVideo(); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}
