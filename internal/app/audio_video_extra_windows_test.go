//go:build windows

package app

import (
	"context"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"
)

// makeQuietWav renders a low-volume sine file for audio tests.
func makeQuietWav(t *testing.T, dir string, seconds int) string {
	t.Helper()
	runner, err := ensureFFmpegRunner()
	if err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(dir, "quiet.wav")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if err := runFFmpegCommand(ctx, runner, []string{
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=" + strconv.Itoa(seconds),
		"-af", "volume=0.05", "-ar", "48000", "-ac", "2",
		output,
	}); err != nil {
		t.Fatal(err)
	}
	return output
}

// meanVolumePattern reads FFmpeg volumedetect output.
var meanVolumePattern = regexp.MustCompile(`mean_volume:\s*(-?[\d.]+)\s*dB`)

// measureMeanVolume runs volumedetect and returns the mean volume in dB.
func measureMeanVolume(t *testing.T, path string) float64 {
	t.Helper()
	runner, err := ensureFFmpegRunner()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	command := exec.CommandContext(ctx, runner, "-nostdin", "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-")
	hideAudioCommand(command)
	log, _ := command.CombinedOutput()
	match := meanVolumePattern.FindStringSubmatch(string(log))
	if match == nil {
		t.Fatalf("无法读取 %s 的音量：%s", filepath.Base(path), log)
	}
	value, err := strconv.ParseFloat(match[1], 64)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

// TestChangeSpeedDoublesRate halves the duration at 2x.
func TestChangeSpeedDoublesRate(t *testing.T) {
	source := copySampleVideo(t)
	service := NewVideoSpeedService()
	service.files = []string{source}
	result, err := service.ChangeSpeed(0, 2)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_倍速.mp4") {
		t.Fatalf("输出命名异常：%s", result.Path)
	}
	info := probeDuration(t, result.Path)
	if info.DurationMs < 400 || info.DurationMs > 700 {
		t.Fatalf("2 倍速时长 = %d ms, 期望约 500 ms", info.DurationMs)
	}
	if !info.HasAudio {
		t.Fatal("倍速结果缺少音轨")
	}
}

// TestChangeSpeedSlowDoublesDuration checks the slow path as well.
func TestChangeSpeedSlowDoublesDuration(t *testing.T) {
	source := copySampleVideo(t)
	service := NewVideoSpeedService()
	service.files = []string{source}
	result, err := service.ChangeSpeed(0, 0.5)
	if err != nil {
		t.Fatal(err)
	}
	info := probeDuration(t, result.Path)
	if info.DurationMs < 1800 || info.DurationMs > 2400 {
		t.Fatalf("0.5 倍速时长 = %d ms, 期望约 2000 ms", info.DurationMs)
	}
}

// TestNormalizeAudioRaisesLoudness checks the loudnorm target is approached.
func TestNormalizeAudioRaisesLoudness(t *testing.T) {
	source := makeQuietWav(t, t.TempDir(), 3)
	before := measureMeanVolume(t, source)
	service := NewVolumeNormalizeService()
	service.files = []string{source}
	result, err := service.NormalizeAudio(0, "wav")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_标准化.wav") {
		t.Fatalf("输出命名异常：%s", result.Path)
	}
	after := measureMeanVolume(t, result.Path)
	if after < before+3 {
		t.Fatalf("响度未提升：%.1f dB → %.1f dB", before, after)
	}
	if after < -24 || after > -10 {
		t.Fatalf("标准化后的平均响度偏离目标：%.1f dB", after)
	}
}

// probeAudioDurationMs reads an audio file's duration from the FFmpeg banner.
func probeAudioDurationMs(t *testing.T, path string) int64 {
	t.Helper()
	runner, err := ensureFFmpegRunner()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	command := exec.CommandContext(ctx, runner, "-nostdin", "-hide_banner", "-i", path)
	hideAudioCommand(command)
	log, _ := command.CombinedOutput()
	duration, ok := parseDurationMillis(string(log))
	if !ok {
		t.Fatalf("无法读取 %s 的时长", filepath.Base(path))
	}
	return duration
}

// TestTrimAudioFast and precise both cut roughly one second.
func TestTrimAudioFast(t *testing.T) {
	source := makeQuietWav(t, t.TempDir(), 3)
	service := NewAudioTrimService()
	service.files = []string{source}
	result, err := service.TrimAudio(0, 0, 1000, "fast")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_剪辑.wav") {
		t.Fatalf("输出命名异常：%s", result.Path)
	}
	duration := probeAudioDurationMs(t, result.Path)
	if duration < 800 || duration > 1300 {
		t.Fatalf("剪辑时长 = %d ms, 期望约 1000 ms", duration)
	}
}

// TestTrimAudioPrecise re-encodes to MP3.
func TestTrimAudioPrecise(t *testing.T) {
	source := makeQuietWav(t, t.TempDir(), 3)
	service := NewAudioTrimService()
	service.files = []string{source}
	result, err := service.TrimAudio(0, 500, 1500, "precise")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(result.Path, "_剪辑.mp3") {
		t.Fatalf("输出命名异常：%s", result.Path)
	}
	duration := probeAudioDurationMs(t, result.Path)
	if duration < 800 || duration > 1300 {
		t.Fatalf("精确剪辑时长 = %d ms, 期望约 1000 ms", duration)
	}
}
