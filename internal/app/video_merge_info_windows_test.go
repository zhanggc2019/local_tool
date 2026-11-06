//go:build windows

package app

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// makeSilentVideo renders a one-second silent test clip with the bundled FFmpeg.
func makeSilentVideo(t *testing.T, dir string) string {
	t.Helper()
	runner, err := ensureFFmpegRunner()
	if err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(dir, "silent.mp4")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if err := runFFmpegCommand(ctx, runner, []string{
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-f", "lavfi", "-i", "testsrc2=size=160x90:rate=12:duration=1",
		"-pix_fmt", "yuv420p",
		"-c:v", "libopenh264", "-rc_mode", "bitrate", "-b:v", "300k",
		output,
	}); err != nil {
		t.Fatal(err)
	}
	return output
}

// probeDuration reads one output's duration through the shared probe helper.
func probeDuration(t *testing.T, path string) videoStreamInfo {
	t.Helper()
	runner, err := ensureFFmpegRunner()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	info, err := probeVideoStreams(ctx, runner, path)
	if err != nil {
		t.Fatal(err)
	}
	return info
}

// TestMergeVideosFast joins two identical clips without re-encoding.
func TestMergeVideosFast(t *testing.T) {
	first := copySampleVideo(t)
	fixture, err := os.ReadFile(first)
	if err != nil {
		t.Fatal(err)
	}
	second := filepath.Join(filepath.Dir(first), "second.mp4")
	if err := os.WriteFile(second, fixture, 0600); err != nil {
		t.Fatal(err)
	}
	service := NewVideoMergeService()
	service.files = []string{first, second}
	result, err := service.MergeVideos([]int{0, 1}, "fast")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_合并.mp4") {
		t.Fatalf("输出命名异常：%s", result.Path)
	}
	data, err := os.ReadFile(result.Path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data[4:32]), "ftyp") {
		t.Fatal("输出缺少 MP4 ftyp 文件头")
	}
	info := probeDuration(t, result.Path)
	if info.DurationMs < 1800 || info.DurationMs > 2400 {
		t.Fatalf("合并时长 = %d ms, 期望约 2000 ms", info.DurationMs)
	}
}

// TestMergeVideosPreciseSilent joins a clip with audio and a silent clip.
func TestMergeVideosPreciseSilent(t *testing.T) {
	withAudio := copySampleVideo(t)
	silent := makeSilentVideo(t, filepath.Dir(withAudio))
	service := NewVideoMergeService()
	service.files = []string{withAudio, silent}
	result, err := service.MergeVideos([]int{1, 0}, "precise")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_合并.mp4") {
		t.Fatalf("输出命名异常：%s", result.Path)
	}
	info := probeDuration(t, result.Path)
	if info.DurationMs < 1800 || info.DurationMs > 2400 {
		t.Fatalf("合并时长 = %d ms, 期望约 2000 ms", info.DurationMs)
	}
	if !info.HasAudio {
		t.Fatal("兼容合并结果缺少音轨（静音补齐失败）")
	}
	if info.Width != 160 || info.Height != 90 {
		t.Fatalf("输出分辨率 = %dx%d, 期望首段 160x90", info.Width, info.Height)
	}
}

// TestParseRealVideoBanner checks the info parser against real FFmpeg output.
func TestParseRealVideoBanner(t *testing.T) {
	source := copySampleVideo(t)
	runner, err := ensureFFmpegRunner()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	command := exec.CommandContext(ctx, runner, "-nostdin", "-hide_banner", "-i", source)
	hideAudioCommand(command)
	log, _ := command.CombinedOutput()
	info := parseVideoInfoOutput("sample-video.mp4", string(log))
	if info.DurationMs != 1000 {
		t.Fatalf("duration = %d, want 1000", info.DurationMs)
	}
	if info.VideoCodec != "h264" || info.Width != 160 || info.Height != 90 || info.FPS != 12 {
		t.Fatalf("video = %+v", info)
	}
	if info.AudioCodec != "aac" || info.SampleRate != 44100 || info.Channels != "mono" {
		t.Fatalf("audio = %+v", info)
	}
}
