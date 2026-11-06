package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// AudioTrimModes lists the supported audio trim strategies.
var AudioTrimModes = []string{"fast", "precise"}

// validateAudioTrimMode checks one trim mode from the frontend.
func validateAudioTrimMode(mode string) error {
	for _, candidate := range AudioTrimModes {
		if candidate == mode {
			return nil
		}
	}
	return errors.New("请选择剪辑方式")
}

// audioTrimOutput picks the output extension for one trim mode.
func audioTrimOutput(sourcePath, mode string) string {
	if mode == "precise" {
		return ".mp3"
	}
	extension := strings.ToLower(filepath.Ext(sourcePath))
	if extension == "" {
		return ".mp3"
	}
	return extension
}

// buildAudioTrimArgs assembles one audio trim command.
func buildAudioTrimArgs(source, output string, startMs, endMs int64, mode string) []string {
	start := fmt.Sprintf("%.3f", float64(startMs)/1000)
	duration := fmt.Sprintf("%.3f", float64(endMs-startMs)/1000)
	args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-ss", start, "-i", source, "-t", duration}
	if mode == "fast" {
		args = append(args, "-c", "copy")
	} else {
		args = append(args, "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "48000", "-f", "mp3")
	}
	args = append(args, output)
	return args
}

// AudioTrimService stores one batch selection and the latest output.
type AudioTrimService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewAudioTrimService creates the native audio trim service.
func NewAudioTrimService() *AudioTrimService { return &AudioTrimService{} }

// ChooseAudios selects one or up to 50 audio files.
func (s *AudioTrimService) ChooseAudios(multiple bool) ([]LocalSource, error) {
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

// TrimAudio saves the requested segment of one audio file.
func (s *AudioTrimService) TrimAudio(index int, startMs, endMs int64, mode string) (AudioResult, error) {
	if err := validateAudioTrimMode(mode); err != nil {
		return AudioResult{}, err
	}
	if startMs < 0 || endMs <= startMs {
		return AudioResult{}, errors.New("请输入有效的起止时间")
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
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	durationMillis, _, err := probeVideoInfo(ctx, runner, source)
	if err != nil {
		return AudioResult{}, err
	}
	if endMs > durationMillis {
		return AudioResult{}, fmt.Errorf("结束时间 %s 超出音频时长 %s", formatTimecodeMs(endMs), formatTimecodeMs(durationMillis))
	}
	extension := audioTrimOutput(source, mode)
	output, err := sameSourceOutput(source, "_剪辑", extension)
	if err != nil {
		return AudioResult{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(output), ".audio-trim-*"+extension)
	if err != nil {
		return AudioResult{}, err
	}
	tempPath := temp.Name()
	_ = temp.Close()
	defer os.Remove(tempPath)
	if err := runFFmpegCommand(ctx, runner, buildAudioTrimArgs(source, tempPath, startMs, endMs, mode)); err != nil {
		return AudioResult{}, fmt.Errorf("音频剪辑失败：%w", err)
	}
	info, err := os.Stat(tempPath)
	if err != nil || info.Size() < 128 {
		return AudioResult{}, errors.New("音频剪辑结果为空")
	}
	if err := os.Rename(tempPath, output); err != nil {
		return AudioResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	return AudioResult{Path: output, Bytes: info.Size()}, nil
}

// OpenAudioTrimOutputFolder opens the latest output directory.
func (s *AudioTrimService) OpenAudioTrimOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已剪辑的音频")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
