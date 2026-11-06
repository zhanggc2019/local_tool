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

// VideoTrimResult summarizes one trimmed video.
type VideoTrimResult struct {
	Path       string `json:"path"`
	Bytes      int64  `json:"bytes"`
	DurationMs int64  `json:"durationMs"`
}

// VideoTrimModes lists the supported trim strategies.
var VideoTrimModes = []string{"fast", "precise"}

// validateVideoTrimMode checks one trim mode coming from the frontend.
func validateVideoTrimMode(mode string) error {
	for _, candidate := range VideoTrimModes {
		if candidate == mode {
			return nil
		}
	}
	return errors.New("请选择剪辑方式")
}

// VideoTrimService stores one batch selection and the latest output.
type VideoTrimService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewVideoTrimService creates the native batch video trim service.
func NewVideoTrimService() *VideoTrimService { return &VideoTrimService{} }

// ChooseVideos selects one or up to 50 videos for trimming.
func (s *VideoTrimService) ChooseVideos(multiple bool) ([]LocalSource, error) {
	s.mu.Lock()
	busy := s.busy
	s.mu.Unlock()
	if busy {
		return nil, errors.New("请等待当前视频处理完成")
	}
	result, err := chooseVideoSources(multiple)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.files = localSourcePaths(result)
	s.lastOutput = ""
	s.mu.Unlock()
	return result, nil
}

// trimBitrateKbps derives a visually safe bitrate for precise re-encoding.
func trimBitrateKbps(inputBytes, durationMillis int64, hasAudio bool) int64 {
	kbps := computeVideoKbps(inputBytes, durationMillis, hasAudio, 1.0)
	if kbps < 1500 {
		return 1500
	}
	if kbps > 15000 {
		return 15000
	}
	return kbps
}

// buildTrimArgs assembles the FFmpeg arguments for one trim mode.
func buildTrimArgs(source, output string, startMs, endMs int64, mode string, videoKbps int64, hasAudio bool) []string {
	durationMs := endMs - startMs
	start := fmt.Sprintf("%.3f", float64(startMs)/1000)
	duration := fmt.Sprintf("%.3f", float64(durationMs)/1000)
	args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-ss", start, "-i", source, "-t", duration}
	if mode == "fast" {
		// Stream copy keeps the original quality; cuts align to keyframes.
		args = append(args, "-c", "copy", "-avoid_negative_ts", "make_zero")
	} else {
		args = append(args,
			"-c:v", "libopenh264", "-rc_mode", "bitrate", "-b:v", fmt.Sprintf("%dk", videoKbps),
			"-pix_fmt", "yuv420p",
		)
		if hasAudio {
			args = append(args, "-c:a", "aac", "-b:a", "128k")
		} else {
			args = append(args, "-an")
		}
		args = append(args, "-movflags", "+faststart")
	}
	args = append(args, output)
	return args
}

// trimOutputExtension picks the output container for one trim mode.
func trimOutputExtension(sourcePath, mode string) string {
	if mode == "precise" {
		return ".mp4"
	}
	extension := strings.ToLower(filepath.Ext(sourcePath))
	if extension == "" {
		return ".mp4"
	}
	return extension
}

// TrimVideo saves the requested segment of one selected video.
func (s *VideoTrimService) TrimVideo(index int, startMs, endMs int64, mode string) (VideoTrimResult, error) {
	if err := validateVideoTrimMode(mode); err != nil {
		return VideoTrimResult{}, err
	}
	if startMs < 0 || endMs <= startMs {
		return VideoTrimResult{}, errors.New("请输入有效的起止时间")
	}
	s.mu.Lock()
	if s.busy || index < 0 || index >= len(s.files) {
		s.mu.Unlock()
		return VideoTrimResult{}, errors.New("视频序号无效或已有任务在运行")
	}
	s.busy = true
	source := s.files[index]
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()
	input, err := validateVideoSource(source)
	if err != nil {
		return VideoTrimResult{}, err
	}
	runner, err := ensureFFmpegRunner()
	if err != nil {
		return VideoTrimResult{}, fmt.Errorf("准备本地视频处理组件失败：%w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()
	durationMillis, hasAudio, err := probeVideoInfo(ctx, runner, source)
	if err != nil {
		return VideoTrimResult{}, err
	}
	if endMs > durationMillis {
		return VideoTrimResult{}, fmt.Errorf("结束时间 %s 超出视频时长 %s", formatTimecodeMs(endMs), formatTimecodeMs(durationMillis))
	}
	extension := trimOutputExtension(source, mode)
	output, err := sameSourceOutput(source, "_剪辑", extension)
	if err != nil {
		return VideoTrimResult{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(output), ".video-trim-*"+extension)
	if err != nil {
		return VideoTrimResult{}, err
	}
	tempPath := temp.Name()
	_ = temp.Close()
	defer os.Remove(tempPath)
	videoKbps := trimBitrateKbps(input.Bytes, durationMillis, hasAudio)
	if err := runFFmpegCommand(ctx, runner, buildTrimArgs(source, tempPath, startMs, endMs, mode, videoKbps, hasAudio)); err != nil {
		return VideoTrimResult{}, fmt.Errorf("视频剪辑失败：%w", err)
	}
	info, err := os.Stat(tempPath)
	if err != nil || info.Size() < 1024 {
		return VideoTrimResult{}, errors.New("视频剪辑结果为空")
	}
	if err := os.Rename(tempPath, output); err != nil {
		return VideoTrimResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	return VideoTrimResult{Path: output, Bytes: info.Size(), DurationMs: endMs - startMs}, nil
}

// OpenVideoTrimOutputFolder opens the latest output directory.
func (s *VideoTrimService) OpenVideoTrimOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已剪辑的视频")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
