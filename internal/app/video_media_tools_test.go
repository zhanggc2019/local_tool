package app

import (
	"path/filepath"
	"strings"
	"testing"
)

// TestFormatTimecodeMs covers the message helper for time display.
func TestFormatTimecodeMs(t *testing.T) {
	cases := []struct {
		ms   int64
		want string
	}{
		{0, "0:00"},
		{900, "0:01"},       // rounds to the nearest second
		{90_000, "1:30"},
		{3_723_500, "1:02:04"},
		{-5, "0:00"},
	}
	for _, tc := range cases {
		if got := formatTimecodeMs(tc.ms); got != tc.want {
			t.Fatalf("formatTimecodeMs(%d) = %q, want %q", tc.ms, got, tc.want)
		}
	}
}

// TestLocalSourcePaths checks the path extraction helper.
func TestLocalSourcePaths(t *testing.T) {
	sources := []LocalSource{{Path: "a.mp4"}, {Path: "b.mov"}}
	if got := localSourcePaths(sources); len(got) != 2 || got[0] != "a.mp4" || got[1] != "b.mov" {
		t.Fatalf("localSourcePaths = %v", got)
	}
	if got := localSourcePaths(nil); len(got) != 0 {
		t.Fatalf("expected empty, got %v", got)
	}
}

// TestValidateVideoTrimMode rejects unknown trim modes.
func TestValidateVideoTrimMode(t *testing.T) {
	for _, mode := range VideoTrimModes {
		if err := validateVideoTrimMode(mode); err != nil {
			t.Fatalf("mode %q rejected: %v", mode, err)
		}
	}
	if err := validateVideoTrimMode("copy"); err == nil || !strings.Contains(err.Error(), "剪辑方式") {
		t.Fatalf("expected mode error, got %v", err)
	}
}

// TestBuildTrimArgs verifies flags for both trim strategies.
func TestBuildTrimArgs(t *testing.T) {
	fast := buildTrimArgs("in.mp4", "out.mp4", 1000, 4000, "fast", 0, true)
	joined := strings.Join(fast, " ")
	for _, want := range []string{"-ss 1.000", "-t 3.000", "-c copy", "avoid_negative_ts make_zero"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("fast args missing %q: %v", want, fast)
		}
	}
	if strings.Contains(joined, "libopenh264") || strings.Contains(joined, "faststart") {
		t.Fatalf("fast args must not re-encode: %v", fast)
	}
	precise := buildTrimArgs("in.mp4", "out.mp4", 0, 2000, "precise", 2500, true)
	joined = strings.Join(precise, " ")
	for _, want := range []string{"libopenh264", "-b:v 2500k", "-c:a aac", "-b:a 128k", "+faststart"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("precise args missing %q: %v", want, precise)
		}
	}
	mute := buildTrimArgs("in.mp4", "out.mp4", 0, 2000, "precise", 2500, false)
	if !strings.Contains(strings.Join(mute, " "), "-an") {
		t.Fatalf("no-audio precise args wrong: %v", mute)
	}
}

// TestTrimOutputExtension checks container selection per mode.
func TestTrimOutputExtension(t *testing.T) {
	if got := trimOutputExtension("clip.webm", "fast"); got != ".webm" {
		t.Fatalf("fast extension = %q, want .webm", got)
	}
	if got := trimOutputExtension("clip.mkv", "precise"); got != ".mp4" {
		t.Fatalf("precise extension = %q, want .mp4", got)
	}
	if got := trimOutputExtension("noext", "fast"); got != ".mp4" {
		t.Fatalf("fallback extension = %q, want .mp4", got)
	}
}

// TestTrimBitrateKbps checks the re-encode bitrate bounds.
func TestTrimBitrateKbps(t *testing.T) {
	if got := trimBitrateKbps(50*1024, 1000, true); got != 1500 {
		t.Fatalf("floor = %d, want 1500", got)
	}
	if got := trimBitrateKbps(20*1024*1024*1024, 1000, false); got != 15000 {
		t.Fatalf("ceiling = %d, want 15000", got)
	}
	// 5 MB over 8 s with audio: 5243 kbps total minus 96 leaves 5147.
	if got := trimBitrateKbps(5*1024*1024, 8000, true); got != 5147 {
		t.Fatalf("derived = %d, want 5147", got)
	}
}

// TestTrimVideoValidation exercises error paths that need no FFmpeg.
func TestTrimVideoValidation(t *testing.T) {
	service := NewVideoTrimService()
	if _, err := service.TrimVideo(0, 0, 1000, "copy"); err == nil || !strings.Contains(err.Error(), "剪辑方式") {
		t.Fatalf("expected mode error, got %v", err)
	}
	if _, err := service.TrimVideo(0, -1, 1000, "fast"); err == nil || !strings.Contains(err.Error(), "起止时间") {
		t.Fatalf("expected time error, got %v", err)
	}
	if _, err := service.TrimVideo(0, 2000, 1000, "fast"); err == nil || !strings.Contains(err.Error(), "起止时间") {
		t.Fatalf("expected reversed time error, got %v", err)
	}
	if _, err := service.TrimVideo(0, 0, 1000, "fast"); err == nil || !strings.Contains(err.Error(), "序号无效") {
		t.Fatalf("expected index error, got %v", err)
	}
	service.files = []string{filepath.Join(t.TempDir(), "missing.mp4")}
	if _, err := service.TrimVideo(0, 0, 500, "fast"); err == nil {
		t.Fatal("expected source error for a missing video")
	}
}

// TestTrimChooseWithoutWindow verifies the desktop dialog guard.
func TestTrimChooseWithoutWindow(t *testing.T) {
	if _, err := NewVideoTrimService().ChooseVideos(false); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}

// TestValidateGIFChoice covers width and frame rate validation.
func TestValidateGIFChoice(t *testing.T) {
	if err := validateGIFChoice(480, 15); err != nil {
		t.Fatalf("valid choice rejected: %v", err)
	}
	if err := validateGIFChoice(500, 15); err == nil || !strings.Contains(err.Error(), "宽度") {
		t.Fatalf("expected width error, got %v", err)
	}
	if err := validateGIFChoice(480, 12); err == nil || !strings.Contains(err.Error(), "帧率") {
		t.Fatalf("expected fps error, got %v", err)
	}
}

// TestCreateGIFValidation exercises GIF error paths that need no FFmpeg.
func TestCreateGIFValidation(t *testing.T) {
	service := NewVideoGIFService()
	if _, err := service.CreateGIF(0, 1000, 480, 15); err == nil || !strings.Contains(err.Error(), "选择一个视频") {
		t.Fatalf("expected selection error, got %v", err)
	}
	service.files = []string{filepath.Join(t.TempDir(), "clip.mp4")}
	if _, err := service.CreateGIF(0, 1000, 512, 15); err == nil || !strings.Contains(err.Error(), "宽度") {
		t.Fatalf("expected width error, got %v", err)
	}
	if _, err := service.CreateGIF(0, 61_000, 480, 15); err == nil || !strings.Contains(err.Error(), "最长") {
		t.Fatalf("expected duration cap error, got %v", err)
	}
	if _, err := service.CreateGIF(3000, 1000, 480, 15); err == nil || !strings.Contains(err.Error(), "起止时间") {
		t.Fatalf("expected time error, got %v", err)
	}
}

// TestBuildGIFArgs verifies the palette filter pipeline.
func TestBuildGIFArgs(t *testing.T) {
	args := buildGIFArgs("in.mp4", "out.gif", 500, 2500, 480, 15)
	joined := strings.Join(args, " ")
	for _, want := range []string{"-ss 0.500", "-t 2.000", "fps=15", "scale=480:-2", "palettegen", "paletteuse", "-an", "out.gif"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("gif args missing %q: %v", want, args)
		}
	}
}

// TestGIFChooseWithoutWindow verifies the desktop dialog guard.
func TestGIFChooseWithoutWindow(t *testing.T) {
	if _, err := NewVideoGIFService().ChooseVideo(); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}

// TestSpreadTimestamps checks the even frame distribution math.
func TestSpreadTimestamps(t *testing.T) {
	points := spreadTimestamps(8000, 4)
	if len(points) != 4 {
		t.Fatalf("points = %v", points)
	}
	for index, want := range []int64{1600, 3200, 4800, 6400} {
		if points[index] != want {
			t.Fatalf("point %d = %d, want %d", index, points[index], want)
		}
	}
	if spreadTimestamps(0, 4) != nil {
		t.Fatal("expected no points for an empty duration")
	}
	if spreadTimestamps(5000, 0) != nil {
		t.Fatal("expected no points for a zero count")
	}
}

// TestValidateVideoFrameChoice covers mode and count validation.
func TestValidateVideoFrameChoice(t *testing.T) {
	if err := validateVideoFrameChoice("single", 0); err != nil {
		t.Fatalf("single mode rejected: %v", err)
	}
	if err := validateVideoFrameChoice("spread", 6); err != nil {
		t.Fatalf("spread mode rejected: %v", err)
	}
	if err := validateVideoFrameChoice("grid", 4); err == nil || !strings.Contains(err.Error(), "截图方式") {
		t.Fatalf("expected mode error, got %v", err)
	}
	if err := validateVideoFrameChoice("spread", 5); err == nil || !strings.Contains(err.Error(), "截图数量") {
		t.Fatalf("expected count error, got %v", err)
	}
}

// TestCaptureFramesValidation exercises frame capture error paths.
func TestCaptureFramesValidation(t *testing.T) {
	service := NewVideoFrameService()
	if _, err := service.CaptureFrames("single", 0, 0); err == nil || !strings.Contains(err.Error(), "选择一个视频") {
		t.Fatalf("expected selection error, got %v", err)
	}
	service.files = []string{filepath.Join(t.TempDir(), "clip.mp4")}
	if _, err := service.CaptureFrames("tile", 0, 4); err == nil || !strings.Contains(err.Error(), "截图方式") {
		t.Fatalf("expected mode error, got %v", err)
	}
	if _, err := service.CaptureFrames("spread", 0, 5); err == nil || !strings.Contains(err.Error(), "截图数量") {
		t.Fatalf("expected count error, got %v", err)
	}
	if _, err := service.CaptureFrames("single", -1, 0); err == nil || !strings.Contains(err.Error(), "截图时间") {
		t.Fatalf("expected timestamp error, got %v", err)
	}
}

// TestFrameChooseWithoutWindow verifies the desktop dialog guard.
func TestFrameChooseWithoutWindow(t *testing.T) {
	if _, err := NewVideoFrameService().ChooseVideo(); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}
