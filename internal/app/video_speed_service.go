package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// VideoSpeedRates lists the selectable playback rates.
var VideoSpeedRates = []float64{0.5, 0.75, 1.25, 1.5, 2, 3, 4}

// validateVideoSpeedRate checks the requested playback rate.
func validateVideoSpeedRate(rate float64) error {
	for _, candidate := range VideoSpeedRates {
		if candidate == rate {
			return nil
		}
	}
	return errors.New("请选择播放速度")
}

// buildAtempoChain chains FFmpeg's atempo filter for rates beyond 0.5–2.
func buildAtempoChain(rate float64) string {
	parts := []string{}
	remaining := rate
	for remaining > 2 {
		parts = append(parts, "atempo=2.0")
		remaining /= 2
	}
	for remaining < 0.5 {
		parts = append(parts, "atempo=0.5")
		remaining /= 0.5
	}
	parts = append(parts, "atempo="+strconv.FormatFloat(remaining, 'f', -1, 64))
	return strings.Join(parts, ",")
}

// buildSpeedArgs assembles the FFmpeg arguments for one playback-rate change.
func buildSpeedArgs(source, output string, rate float64, videoKbps int64, hasAudio bool) []string {
	args := []string{
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-i", source,
		"-vf", fmt.Sprintf("setpts=PTS/%.6g", rate),
	}
	if hasAudio {
		args = append(args, "-af", buildAtempoChain(rate))
	} else {
		args = append(args, "-an")
	}
	args = append(args,
		"-c:v", "libopenh264", "-rc_mode", "bitrate", "-b:v", fmt.Sprintf("%dk", videoKbps),
		"-pix_fmt", "yuv420p",
	)
	if hasAudio {
		args = append(args, "-c:a", "aac", "-b:a", "128k")
	}
	args = append(args, "-sn", "-dn", "-movflags", "+faststart", output)
	return args
}

// VideoSpeedService stores one batch selection and the latest output.
type VideoSpeedService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewVideoSpeedService creates the native playback-rate service.
func NewVideoSpeedService() *VideoSpeedService { return &VideoSpeedService{} }

// ChooseVideos selects one or up to 50 videos.
func (s *VideoSpeedService) ChooseVideos(multiple bool) ([]LocalSource, error) {
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

// ChangeSpeed re-encodes one video at the requested playback rate.
func (s *VideoSpeedService) ChangeSpeed(index int, rate float64) (VideoTrimResult, error) {
	if err := validateVideoSpeedRate(rate); err != nil {
		return VideoTrimResult{}, err
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
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Minute)
	defer cancel()
	durationMillis, hasAudio, err := probeVideoInfo(ctx, runner, source)
	if err != nil {
		return VideoTrimResult{}, err
	}
	videoKbps := computeVideoKbps(input.Bytes, durationMillis, hasAudio, 0.9)
	output, err := sameSourceOutput(source, "_倍速", ".mp4")
	if err != nil {
		return VideoTrimResult{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(output), ".video-speed-*.mp4")
	if err != nil {
		return VideoTrimResult{}, err
	}
	tempPath := temp.Name()
	_ = temp.Close()
	defer os.Remove(tempPath)
	if err := runFFmpegCommand(ctx, runner, buildSpeedArgs(source, tempPath, rate, videoKbps, hasAudio)); err != nil {
		return VideoTrimResult{}, fmt.Errorf("视频倍速失败：%w", err)
	}
	info, err := os.Stat(tempPath)
	if err != nil || info.Size() < 1024 {
		return VideoTrimResult{}, errors.New("视频倍速结果为空")
	}
	if err := os.Rename(tempPath, output); err != nil {
		return VideoTrimResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	return VideoTrimResult{Path: output, Bytes: info.Size(), DurationMs: int64(float64(durationMillis)/rate + 0.5)}, nil
}

// OpenVideoSpeedOutputFolder opens the latest output directory.
func (s *VideoSpeedService) OpenVideoSpeedOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已调整速度的视频")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
