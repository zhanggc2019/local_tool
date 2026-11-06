package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestBuildAtempoChain covers rate clamps beyond FFmpeg's 0.5–2 range.
func TestBuildAtempoChain(t *testing.T) {
	cases := map[float64]string{
		0.25: "atempo=0.5,atempo=0.5",
		0.5:  "atempo=0.5",
		1.5:  "atempo=1.5",
		2:    "atempo=2",
		3:    "atempo=2.0,atempo=1.5",
		4:    "atempo=2.0,atempo=2",
	}
	for rate, want := range cases {
		if got := buildAtempoChain(rate); got != want {
			t.Fatalf("rate %v chain = %q, want %q", rate, got, want)
		}
	}
}

// TestBuildSpeedArgs verifies the setpts/atempo flags with and without audio.
func TestBuildSpeedArgs(t *testing.T) {
	withAudio := strings.Join(buildSpeedArgs("in.mp4", "out.mp4", 2, 2000, true), " ")
	for _, want := range []string{"setpts=PTS/2", "-af atempo=2", "libopenh264", "-c:a aac", "+faststart"} {
		if !strings.Contains(withAudio, want) {
			t.Fatalf("speed args missing %q: %s", want, withAudio)
		}
	}
	mute := strings.Join(buildSpeedArgs("in.mp4", "out.mp4", 0.5, 2000, false), " ")
	if strings.Contains(mute, "-af") || !strings.Contains(mute, "-an") {
		t.Fatalf("no-audio speed args wrong: %s", mute)
	}
	if !strings.Contains(mute, "setpts=PTS/0.5") {
		t.Fatalf("slow-speed filter wrong: %s", mute)
	}
}

// TestVideoSpeedValidation covers rate, index, and source checks.
func TestVideoSpeedValidation(t *testing.T) {
	service := NewVideoSpeedService()
	if _, err := service.ChangeSpeed(0, 5); err == nil || !strings.Contains(err.Error(), "播放速度") {
		t.Fatalf("expected rate error, got %v", err)
	}
	if _, err := service.ChangeSpeed(0, 2); err == nil || !strings.Contains(err.Error(), "序号无效") {
		t.Fatalf("expected index error, got %v", err)
	}
	service.files = []string{filepath.Join(t.TempDir(), "missing.mp4")}
	if _, err := service.ChangeSpeed(0, 2); err == nil {
		t.Fatal("expected source error")
	}
}

// TestBuildLoudnormArgs checks the loudness filter and codec flags.
func TestBuildLoudnormArgs(t *testing.T) {
	mp3 := strings.Join(buildLoudnormArgs("in.wav", "out.mp3", "mp3"), " ")
	for _, want := range []string{"loudnorm=I=-16:TP=-1.5:LRA=11", "-ar 48000", "libmp3lame", "-b:a 192k", "-f mp3"} {
		if !strings.Contains(mp3, want) {
			t.Fatalf("mp3 args missing %q: %s", want, mp3)
		}
	}
	wav := strings.Join(buildLoudnormArgs("in.mp3", "out.wav", "wav"), " ")
	if !strings.Contains(wav, "pcm_s16le") || !strings.Contains(wav, "-f wav") {
		t.Fatalf("wav args wrong: %s", wav)
	}
}

// TestVolumeNormalizeValidation covers format, index, and source checks.
func TestVolumeNormalizeValidation(t *testing.T) {
	service := NewVolumeNormalizeService()
	if _, err := service.NormalizeAudio(0, "flac"); err == nil || !strings.Contains(err.Error(), "MP3 或 WAV") {
		t.Fatalf("expected format error, got %v", err)
	}
	if _, err := service.NormalizeAudio(0, "mp3"); err == nil || !strings.Contains(err.Error(), "序号无效") {
		t.Fatalf("expected index error, got %v", err)
	}
	service.files = []string{filepath.Join(t.TempDir(), "missing.mp3")}
	if _, err := service.NormalizeAudio(0, "mp3"); err == nil {
		t.Fatal("expected source error")
	}
}

// TestAudioTrimHelpers covers output extensions and encode flags.
func TestAudioTrimHelpers(t *testing.T) {
	if got := audioTrimOutput("song.flac", "fast"); got != ".flac" {
		t.Fatalf("fast extension = %q", got)
	}
	if got := audioTrimOutput("song.wav", "precise"); got != ".mp3" {
		t.Fatalf("precise extension = %q", got)
	}
	fast := strings.Join(buildAudioTrimArgs("in.wav", "out.wav", 1000, 3000, "fast"), " ")
	for _, want := range []string{"-ss 1.000", "-t 2.000", "-c copy"} {
		if !strings.Contains(fast, want) {
			t.Fatalf("fast args missing %q: %s", want, fast)
		}
	}
	precise := strings.Join(buildAudioTrimArgs("in.wav", "out.mp3", 0, 2000, "precise"), " ")
	if !strings.Contains(precise, "libmp3lame") || !strings.Contains(precise, "-b:a 192k") {
		t.Fatalf("precise args wrong: %s", precise)
	}
}

// TestAudioTrimValidation covers mode, time, and index guards.
func TestAudioTrimValidation(t *testing.T) {
	service := NewAudioTrimService()
	if _, err := service.TrimAudio(0, 0, 1000, "copy"); err == nil || !strings.Contains(err.Error(), "剪辑方式") {
		t.Fatalf("expected mode error, got %v", err)
	}
	if _, err := service.TrimAudio(0, -1, 1000, "fast"); err == nil || !strings.Contains(err.Error(), "起止时间") {
		t.Fatalf("expected time error, got %v", err)
	}
	if _, err := service.TrimAudio(0, 2000, 1000, "fast"); err == nil || !strings.Contains(err.Error(), "起止时间") {
		t.Fatalf("expected reversed time error, got %v", err)
	}
	if _, err := service.TrimAudio(0, 0, 1000, "fast"); err == nil || !strings.Contains(err.Error(), "序号无效") {
		t.Fatalf("expected index error, got %v", err)
	}
	service.files = []string{filepath.Join(t.TempDir(), "missing.mp3")}
	if _, err := service.TrimAudio(0, 0, 500, "fast"); err == nil {
		t.Fatal("expected source error")
	}
}

// TestValidateMediaAudioSource covers the shared audio picker rules.
func TestValidateMediaAudioSource(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"a.mp3", "b.wav", "c.m4a", "d.flac", "e.ogg"} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("audio"), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := validateMediaAudioSource(path); err != nil {
			t.Fatalf("%s rejected: %v", name, err)
		}
	}
	video := filepath.Join(dir, "clip.mp4")
	if err := os.WriteFile(video, []byte("video"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := validateMediaAudioSource(video); err == nil || !strings.Contains(err.Error(), "格式") {
		t.Fatalf("expected format error, got %v", err)
	}
}

// TestAudioServicesChooseWithoutWindow verifies all desktop dialog guards.
func TestAudioServicesChooseWithoutWindow(t *testing.T) {
	if _, err := NewVideoSpeedService().ChooseVideos(false); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("speed choose error = %v", err)
	}
	if _, err := NewVolumeNormalizeService().ChooseAudios(true); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("volume choose error = %v", err)
	}
	if _, err := NewAudioTrimService().ChooseAudios(true); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("trim choose error = %v", err)
	}
}
