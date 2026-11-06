package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// loudnormFilter targets -16 LUFS, the common streaming/podcast level.
const loudnormFilter = "loudnorm=I=-16:TP=-1.5:LRA=11"

// buildLoudnormArgs assembles one normalization command.
func buildLoudnormArgs(source, output, format string) []string {
	args := []string{
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-i", source,
		"-af", loudnormFilter,
		"-ar", "48000",
	}
	if format == "wav" {
		args = append(args, "-c:a", "pcm_s16le", "-f", "wav")
	} else {
		args = append(args, "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3")
	}
	args = append(args, output)
	return args
}

// validateAudioOutputFormat accepts the two offered output formats.
func validateAudioOutputFormat(format string) error {
	if format != "mp3" && format != "wav" {
		return errors.New("请选择 MP3 或 WAV 输出格式")
	}
	return nil
}

// VolumeNormalizeService stores one batch selection and the latest output.
type VolumeNormalizeService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewVolumeNormalizeService creates the native loudness normalization service.
func NewVolumeNormalizeService() *VolumeNormalizeService { return &VolumeNormalizeService{} }

// ChooseAudios selects one or up to 50 audio files.
func (s *VolumeNormalizeService) ChooseAudios(multiple bool) ([]LocalSource, error) {
	s.mu.Lock()
	busy := s.busy
	s.mu.Unlock()
	if busy {
		return nil, errors.New("请等待当前音频处理完成")
	}
	result, err := chooseAudioSources(multiple)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.files = localSourcePaths(result)
	s.lastOutput = ""
	s.mu.Unlock()
	return result, nil
}

// NormalizeAudio converts one audio file to the target loudness.
func (s *VolumeNormalizeService) NormalizeAudio(index int, format string) (AudioResult, error) {
	if err := validateAudioOutputFormat(format); err != nil {
		return AudioResult{}, err
	}
	s.mu.Lock()
	if s.busy || index < 0 || index >= len(s.files) {
		s.mu.Unlock()
		return AudioResult{}, errors.New("音频序号无效或已有任务在运行")
	}
	s.busy = true
	source := s.files[index]
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()
	if _, err := validateMediaAudioSource(source); err != nil {
		return AudioResult{}, err
	}
	runner, err := ensureFFmpegRunner()
	if err != nil {
		return AudioResult{}, fmt.Errorf("准备本地音频处理组件失败：%w", err)
	}
	output, err := sameSourceOutput(source, "_标准化", "."+format)
	if err != nil {
		return AudioResult{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(output), ".volume-*."+format)
	if err != nil {
		return AudioResult{}, err
	}
	tempPath := temp.Name()
	_ = temp.Close()
	defer os.Remove(tempPath)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	if err := runFFmpegCommand(ctx, runner, buildLoudnormArgs(source, tempPath, format)); err != nil {
		return AudioResult{}, fmt.Errorf("音量标准化失败：%w", err)
	}
	info, err := os.Stat(tempPath)
	if err != nil || info.Size() < 128 {
		return AudioResult{}, errors.New("音量标准化结果为空")
	}
	if err := os.Rename(tempPath, output); err != nil {
		return AudioResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	return AudioResult{Path: output, Bytes: info.Size()}, nil
}

// OpenVolumeOutputFolder opens the latest output directory.
func (s *VolumeNormalizeService) OpenVolumeOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已标准化的音频")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(path, false)
}
