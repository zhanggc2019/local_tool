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

// VideoGIFResult summarizes one generated GIF.
type VideoGIFResult struct {
	Path       string `json:"path"`
	Bytes      int64  `json:"bytes"`
	DurationMs int64  `json:"durationMs"`
}

// GIFLimits bound the exported GIF dimensions and frame rate.
var (
	gifWidths = []int{320, 480, 640}
	gifFPS     = []int{10, 15, 24}
)

// gifMaxDurationMs caps the clip length so GIFs stay a manageable size.
const gifMaxDurationMs = 60 * 1000

// validateGIFChoice checks the width and frame rate coming from the frontend.
func validateGIFChoice(width, fps int) error {
	if !containsInt(gifWidths, width) {
		return errors.New("请选择 GIF 宽度")
	}
	if !containsInt(gifFPS, fps) {
		return errors.New("请选择 GIF 帧率")
	}
	return nil
}

// containsInt reports whether the value is part of the list.
func containsInt(values []int, want int) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

// VideoGIFService stores one selection and the latest output.
type VideoGIFService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewVideoGIFService creates the native video-to-GIF service.
func NewVideoGIFService() *VideoGIFService { return &VideoGIFService{} }

// ChooseVideo selects one video for GIF export.
func (s *VideoGIFService) ChooseVideo() ([]LocalSource, error) {
	s.mu.Lock()
	busy := s.busy
	s.mu.Unlock()
	if busy {
		return nil, errors.New("请等待当前 GIF 任务完成")
	}
	result, err := chooseVideoSources(false)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.files = localSourcePaths(result)
	s.lastOutput = ""
	s.mu.Unlock()
	return result, nil
}

// buildGIFArgs assembles the palette-based GIF export command.
func buildGIFArgs(source, output string, startMs, endMs int64, width, fps int) []string {
	start := fmt.Sprintf("%.3f", float64(startMs)/1000)
	duration := fmt.Sprintf("%.3f", float64(endMs-startMs)/1000)
	filter := fmt.Sprintf(
		"fps=%d,scale=%d:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4",
		fps, width,
	)
	return []string{
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-ss", start, "-i", source, "-t", duration,
		"-filter_complex", filter, "-an",
		output,
	}
}

// CreateGIF exports the requested segment of the selected video as a GIF.
func (s *VideoGIFService) CreateGIF(startMs, endMs int64, width, fps int) (VideoGIFResult, error) {
	if err := validateGIFChoice(width, fps); err != nil {
		return VideoGIFResult{}, err
	}
	if startMs < 0 || endMs <= startMs {
		return VideoGIFResult{}, errors.New("请输入有效的起止时间")
	}
	if endMs-startMs > gifMaxDurationMs {
		return VideoGIFResult{}, fmt.Errorf("GIF 片段最长 %s", formatTimecodeMs(gifMaxDurationMs))
	}
	s.mu.Lock()
	if s.busy || len(s.files) != 1 {
		s.mu.Unlock()
		return VideoGIFResult{}, errors.New("请先选择一个视频")
	}
	s.busy = true
	source := s.files[0]
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()
	if _, err := validateVideoSource(source); err != nil {
		return VideoGIFResult{}, err
	}
	runner, err := ensureFFmpegRunner()
	if err != nil {
		return VideoGIFResult{}, fmt.Errorf("准备本地视频处理组件失败：%w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	durationMillis, _, err := probeVideoInfo(ctx, runner, source)
	if err != nil {
		return VideoGIFResult{}, err
	}
	if endMs > durationMillis {
		return VideoGIFResult{}, fmt.Errorf("结束时间 %s 超出视频时长 %s", formatTimecodeMs(endMs), formatTimecodeMs(durationMillis))
	}
	output, err := sameSourceOutput(source, "_GIF", ".gif")
	if err != nil {
		return VideoGIFResult{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(output), ".video-gif-*.gif")
	if err != nil {
		return VideoGIFResult{}, err
	}
	tempPath := temp.Name()
	_ = temp.Close()
	defer os.Remove(tempPath)
	if err := runFFmpegCommand(ctx, runner, buildGIFArgs(source, tempPath, startMs, endMs, width, fps)); err != nil {
		return VideoGIFResult{}, fmt.Errorf("GIF 生成失败：%w", err)
	}
	info, err := os.Stat(tempPath)
	if err != nil || info.Size() < 64 {
		return VideoGIFResult{}, errors.New("GIF 生成结果为空")
	}
	if err := os.Rename(tempPath, output); err != nil {
		return VideoGIFResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	return VideoGIFResult{Path: output, Bytes: info.Size(), DurationMs: endMs - startMs}, nil
}

// OpenVideoGIFOutputFolder opens the latest output directory.
func (s *VideoGIFService) OpenVideoGIFOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已生成的 GIF")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
