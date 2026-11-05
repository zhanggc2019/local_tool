package main

import (
	"archive/zip"
	"bytes"
	"context"
	"embed"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ffmpegAssets bundles the LGPL Windows build for fully local video extraction.
//
//go:embed third_party/ffmpeg/ffmpeg-win64-lgpl.zip
var ffmpegAssets embed.FS

// VideoAudioService stores one batch selection and the latest output directory.
type VideoAudioService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	runner     string
	busy       bool
}

// NewVideoAudioService creates the native batch video-to-audio service.
func NewVideoAudioService() *VideoAudioService { return &VideoAudioService{} }

// validateVideoSource checks the selected format and keeps input sizes bounded.
func validateVideoSource(path string) (LocalSource, error) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".wmv":
	default:
		return LocalSource{}, errors.New("视频格式不受支持")
	}
	info, err := os.Stat(path)
	if err != nil {
		return LocalSource{}, err
	}
	if info.IsDir() || info.Size() < 1 || info.Size() > 4*1024*1024*1024 {
		return LocalSource{}, errors.New("视频为空或超过 4 GB")
	}
	return LocalSource{Name: info.Name(), Path: path, Bytes: info.Size()}, nil
}

// ChooseVideos selects one or up to 50 videos with their native paths.
func (s *VideoAudioService) ChooseVideos(multiple bool) ([]LocalSource, error) {
	s.mu.Lock()
	busy := s.busy
	s.mu.Unlock()
	if busy {
		return nil, errors.New("请等待当前视频处理完成")
	}
	app := application.Get()
	if app == nil {
		return nil, errors.New("桌面窗口尚未就绪")
	}
	dialog := app.Dialog.OpenFile().SetTitle("选择视频").AddFilter("视频文件", "*.mp4;*.mov;*.mkv;*.avi;*.webm;*.m4v;*.wmv")
	var paths []string
	var err error
	if multiple {
		paths, err = dialog.PromptForMultipleSelection()
	} else {
		var path string
		path, err = dialog.PromptForSingleSelection()
		if path != "" {
			paths = []string{path}
		}
	}
	if err != nil || len(paths) == 0 {
		return nil, err
	}
	if len(paths) > 50 {
		return nil, errors.New("一次最多选择 50 个视频")
	}
	result := make([]LocalSource, 0, len(paths))
	for _, path := range paths {
		file, err := validateVideoSource(path)
		if err != nil {
			return nil, fmt.Errorf("%s：%w", filepath.Base(path), err)
		}
		result = append(result, file)
	}
	s.mu.Lock()
	s.files = append([]string(nil), paths...)
	s.lastOutput = ""
	s.mu.Unlock()
	return result, nil
}

// ensureFFmpeg extracts the pinned LGPL executable and DLLs into a user cache.
func (s *VideoAudioService) ensureFFmpeg() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.runner != "" {
		return s.runner, nil
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(cache, "LocalToolbox", "ffmpeg-8.1-lgpl-68d052ea")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	content, err := ffmpegAssets.ReadFile("third_party/ffmpeg/ffmpeg-win64-lgpl.zip")
	if err != nil {
		return "", err
	}
	archive, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return "", err
	}
	for _, entry := range archive.File {
		if filepath.Base(entry.Name) != entry.Name || !(entry.Name == "ffmpeg.exe" || entry.Name == "LICENSE.txt" || strings.HasSuffix(strings.ToLower(entry.Name), ".dll")) {
			return "", errors.New("FFmpeg 组件包包含无效路径")
		}
		path := filepath.Join(dir, entry.Name)
		if info, err := os.Stat(path); err == nil && info.Size() == int64(entry.UncompressedSize64) {
			continue
		}
		input, err := entry.Open()
		if err != nil {
			return "", err
		}
		temp, err := os.CreateTemp(dir, ".ffmpeg-*")
		if err != nil {
			_ = input.Close()
			return "", err
		}
		_, copyErr := io.Copy(temp, input)
		closeErr := temp.Close()
		_ = input.Close()
		if copyErr != nil || closeErr != nil {
			_ = os.Remove(temp.Name())
			return "", errors.Join(copyErr, closeErr)
		}
		_ = os.Remove(path)
		if err := os.Rename(temp.Name(), path); err != nil {
			_ = os.Remove(temp.Name())
			return "", err
		}
	}
	s.runner = filepath.Join(dir, "ffmpeg.exe")
	return s.runner, nil
}

// runFFmpegAudio extracts the first audio stream into a temporary WAV or MP3.
func runFFmpegAudio(ctx context.Context, runner, source, output, format string) error {
	args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", source, "-map", "0:a:0", "-vn", "-sn", "-dn", "-ar", "48000", "-ac", "2"}
	if format == "mp3" {
		args = append(args, "-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3")
	} else {
		args = append(args, "-c:a", "pcm_s16le", "-f", "wav")
	}
	args = append(args, output)
	command := exec.CommandContext(ctx, runner, args...)
	hideAudioCommand(command)
	log, err := command.CombinedOutput()
	if err == nil {
		return nil
	}
	message := strings.TrimSpace(string(log))
	if strings.Contains(message, "matches no streams") || strings.Contains(message, "does not contain any stream") {
		return errors.New("视频没有可提取的音轨")
	}
	if len(message) > 500 {
		message = message[len(message)-500:]
	}
	return fmt.Errorf("视频音频提取失败：%w：%s", err, message)
}

// ExtractVideoAudio saves one selected video's audio beside that video.
func (s *VideoAudioService) ExtractVideoAudio(index int, format string) (AudioResult, error) {
	if format != "wav" && format != "mp3" {
		return AudioResult{}, errors.New("请选择 WAV 或 MP3 输出格式")
	}
	s.mu.Lock()
	if s.busy || index < 0 || index >= len(s.files) {
		s.mu.Unlock()
		return AudioResult{}, errors.New("视频序号无效或已有任务在运行")
	}
	s.busy = true
	source := s.files[index]
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()
	if _, err := validateVideoSource(source); err != nil {
		return AudioResult{}, err
	}
	runner, err := s.ensureFFmpeg()
	if err != nil {
		return AudioResult{}, fmt.Errorf("准备本地视频处理组件失败：%w", err)
	}
	output, err := sameSourceOutput(source, "_音频", "."+format)
	if err != nil {
		return AudioResult{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(output), ".video-audio-*."+format)
	if err != nil {
		return AudioResult{}, err
	}
	tempPath := temp.Name()
	_ = temp.Close()
	defer os.Remove(tempPath)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	if err := runFFmpegAudio(ctx, runner, source, tempPath, format); err != nil {
		return AudioResult{}, err
	}
	info, err := os.Stat(tempPath)
	if err != nil || info.Size() < 128 {
		return AudioResult{}, errors.New("音频提取结果为空")
	}
	if err := os.Rename(tempPath, output); err != nil {
		return AudioResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	return AudioResult{Path: output, Bytes: info.Size()}, nil
}

// OpenVideoOutputFolder opens the latest output directory in File Explorer.
func (s *VideoAudioService) OpenVideoOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已提取的音频")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
