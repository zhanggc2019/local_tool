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

// VideoFrameResult summarizes one capture run.
type VideoFrameResult struct {
	Paths []string `json:"paths"`
	Count int      `json:"count"`
	Bytes int64    `json:"bytes"`
}

// VideoFrameModes lists the supported capture strategies.
var VideoFrameModes = []string{"single", "spread"}

// frameCounts lists the selectable frame counts for spread mode.
var frameCounts = []int{4, 6, 9, 12}

// validateVideoFrameChoice checks the mode and count coming from the frontend.
func validateVideoFrameChoice(mode string, count int) error {
	found := false
	for _, candidate := range VideoFrameModes {
		if candidate == mode {
			found = true
			break
		}
	}
	if !found {
		return errors.New("请选择截图方式")
	}
	if mode == "spread" && !containsInt(frameCounts, count) {
		return errors.New("请选择截图数量")
	}
	return nil
}

// spreadTimestamps divides the duration into count evenly spaced capture
// points, keeping clear of the very first and last frames.
func spreadTimestamps(durationMs int64, count int) []int64 {
	if durationMs <= 0 || count <= 0 {
		return nil
	}
	points := make([]int64, count)
	for index := 0; index < count; index++ {
		points[index] = durationMs * int64(index+1) / int64(count+1)
	}
	return points
}

// VideoFrameService stores one selection and the latest output.
type VideoFrameService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewVideoFrameService creates the native video frame capture service.
func NewVideoFrameService() *VideoFrameService { return &VideoFrameService{} }

// ChooseVideo selects one video for frame capture.
func (s *VideoFrameService) ChooseVideo() ([]LocalSource, error) {
	s.mu.Lock()
	busy := s.busy
	s.mu.Unlock()
	if busy {
		return nil, errors.New("请等待当前截图任务完成")
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

// buildFrameArgs assembles the single-frame capture command.
func buildFrameArgs(source, output string, timestampMs int64) []string {
	timestamp := fmt.Sprintf("%.3f", float64(timestampMs)/1000)
	return []string{
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-ss", timestamp, "-i", source,
		"-frames:v", "1", "-q:v", "2",
		output,
	}
}

// captureFrame writes one JPEG frame using the runner.
func captureFrame(ctx context.Context, runner, source, output string, timestampMs int64) error {
	if err := runFFmpegCommand(ctx, runner, buildFrameArgs(source, output, timestampMs)); err != nil {
		return fmt.Errorf("截图失败：%w", err)
	}
	info, err := os.Stat(output)
	if err != nil || info.Size() < 256 {
		return errors.New("截图结果为空")
	}
	return nil
}

// CaptureFrames saves one frame at the timestamp or evenly spaced frames.
func (s *VideoFrameService) CaptureFrames(mode string, timestampMs int64, count int) (VideoFrameResult, error) {
	if err := validateVideoFrameChoice(mode, count); err != nil {
		return VideoFrameResult{}, err
	}
	if mode == "single" && timestampMs < 0 {
		return VideoFrameResult{}, errors.New("请输入有效的截图时间")
	}
	s.mu.Lock()
	if s.busy || len(s.files) != 1 {
		s.mu.Unlock()
		return VideoFrameResult{}, errors.New("请先选择一个视频")
	}
	s.busy = true
	source := s.files[0]
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()
	if _, err := validateVideoSource(source); err != nil {
		return VideoFrameResult{}, err
	}
	runner, err := ensureFFmpegRunner()
	if err != nil {
		return VideoFrameResult{}, fmt.Errorf("准备本地视频处理组件失败：%w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	durationMillis, _, err := probeVideoInfo(ctx, runner, source)
	if err != nil {
		return VideoFrameResult{}, err
	}
	if mode == "single" && timestampMs >= durationMillis {
		return VideoFrameResult{}, fmt.Errorf("截图时间 %s 超出视频时长 %s", formatTimecodeMs(timestampMs), formatTimecodeMs(durationMillis))
	}

	workDir, err := os.MkdirTemp(filepath.Dir(source), ".video-frame-")
	if err != nil {
		return VideoFrameResult{}, err
	}
	defer os.RemoveAll(workDir)

	var timestamps []int64
	var suffixes []string
	if mode == "single" {
		timestamps = []int64{timestampMs}
		suffixes = []string{"_截图"}
	} else {
		timestamps = spreadTimestamps(durationMillis, count)
		if len(timestamps) == 0 {
			return VideoFrameResult{}, errors.New("视频时长太短，无法均分截图")
		}
		for index := range timestamps {
			suffixes = append(suffixes, fmt.Sprintf("_截图_%d", index+1))
		}
	}

	paths := make([]string, 0, len(timestamps))
	var bytes int64
	for index, timestamp := range timestamps {
		staged := filepath.Join(workDir, fmt.Sprintf("frame_%d.jpg", index))
		if err := captureFrame(ctx, runner, source, staged, timestamp); err != nil {
			return VideoFrameResult{}, err
		}
		output, err := sameSourceOutput(source, suffixes[index], ".jpg")
		if err != nil {
			return VideoFrameResult{}, err
		}
		if err := os.Rename(staged, output); err != nil {
			return VideoFrameResult{}, err
		}
		if info, statErr := os.Stat(output); statErr == nil {
			bytes += info.Size()
		}
		paths = append(paths, output)
	}
	s.mu.Lock()
	s.lastOutput = paths[0]
	s.mu.Unlock()
	return VideoFrameResult{Paths: paths, Count: len(paths), Bytes: bytes}, nil
}

// OpenVideoFrameOutputFolder opens the latest output directory.
func (s *VideoFrameService) OpenVideoFrameOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已保存的截图")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
