package app

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// VideoInfo describes the tracks and file size of one video.
type VideoInfo struct {
	Name             string  `json:"name"`
	Path             string  `json:"path"`
	Bytes            int64   `json:"bytes"`
	Container        string  `json:"container"`
	DurationMs       int64   `json:"durationMs"`
	BitrateKbps      int     `json:"bitrateKbps"`
	VideoCodec       string  `json:"videoCodec"`
	Width            int     `json:"width"`
	Height           int     `json:"height"`
	FPS              float64 `json:"fps"`
	VideoBitrateKbps int     `json:"videoBitrateKbps"`
	AudioCodec       string  `json:"audioCodec"`
	SampleRate       int     `json:"sampleRate"`
	Channels         string  `json:"channels"`
	AudioBitrateKbps int     `json:"audioBitrateKbps"`
}

var (
	containerPattern   = regexp.MustCompile(`Input #0,\s*([^,]+),`)
	overallBitrate     = regexp.MustCompile(`bitrate:\s*(\d+)\s*kb/s`)
	videoCodecPattern  = regexp.MustCompile(`Video:\s*([A-Za-z0-9_.-]+)`)
	audioCodecPattern  = regexp.MustCompile(`Audio:\s*([A-Za-z0-9_.-]+)`)
	audioRatePattern   = regexp.MustCompile(`(\d+)\s*Hz`)
	audioBitrate       = regexp.MustCompile(`(\d+)\s*kb/s`)
	channelPattern     = regexp.MustCompile(`(mono|stereo|[\d.]+ channels)`)
	streamBitrateMatch = regexp.MustCompile(`(\d+)\s*kb/s`)
)

// parseVideoInfoOutput turns one FFmpeg banner into structured metadata.
func parseVideoInfoOutput(name, log string) VideoInfo {
	info := VideoInfo{Name: name}
	if match := containerPattern.FindStringSubmatch(log); match != nil {
		info.Container = strings.TrimSpace(match[1])
	}
	if duration, ok := parseDurationMillis(log); ok {
		info.DurationMs = duration
	}
	if match := overallBitrate.FindStringSubmatch(log); match != nil {
		info.BitrateKbps, _ = strconv.Atoi(match[1])
	}
	for _, line := range strings.Split(log, "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case info.VideoCodec == "" && strings.Contains(trimmed, "Video:"):
			if match := videoCodecPattern.FindStringSubmatch(trimmed); match != nil {
				info.VideoCodec = match[1]
			}
			if match := videoSizePattern.FindStringSubmatch(trimmed); match != nil {
				info.Width, _ = strconv.Atoi(match[1])
				info.Height, _ = strconv.Atoi(match[2])
			}
			if match := videoFPSPattern.FindStringSubmatch(trimmed); match != nil {
				info.FPS, _ = strconv.ParseFloat(match[1], 64)
			}
			if match := streamBitrateMatch.FindStringSubmatch(trimmed); match != nil {
				info.VideoBitrateKbps, _ = strconv.Atoi(match[1])
			}
		case info.AudioCodec == "" && strings.Contains(trimmed, "Audio:"):
			if match := audioCodecPattern.FindStringSubmatch(trimmed); match != nil {
				info.AudioCodec = match[1]
			}
			if match := audioRatePattern.FindStringSubmatch(trimmed); match != nil {
				info.SampleRate, _ = strconv.Atoi(match[1])
			}
			if match := channelPattern.FindStringSubmatch(trimmed); match != nil {
				info.Channels = match[1]
			}
			if match := audioBitrate.FindStringSubmatch(trimmed); match != nil {
				info.AudioBitrateKbps, _ = strconv.Atoi(match[1])
			}
		}
	}
	return info
}

// VideoInfoService probes one selected video for display.
type VideoInfoService struct {
	mu   sync.Mutex
	busy bool
}

// NewVideoInfoService creates the native video inspection service.
func NewVideoInfoService() *VideoInfoService { return &VideoInfoService{} }

// ChooseVideo selects one video and returns its metadata.
func (s *VideoInfoService) ChooseVideo() (VideoInfo, error) {
	s.mu.Lock()
	busy := s.busy
	s.mu.Unlock()
	if busy {
		return VideoInfo{}, errors.New("正在读取视频信息")
	}
	app := application.Get()
	if app == nil {
		return VideoInfo{}, errors.New("桌面窗口尚未就绪")
	}
	path, err := app.Dialog.OpenFile().
		SetTitle("选择视频").
		AddFilter("视频文件", "*.mp4;*.mov;*.mkv;*.avi;*.webm;*.m4v;*.wmv").
		PromptForSingleSelection()
	if err != nil || path == "" {
		return VideoInfo{}, err
	}
	source, err := validateVideoSource(path)
	if err != nil {
		return VideoInfo{}, fmt.Errorf("%s：%w", filepath.Base(path), err)
	}
	s.mu.Lock()
	if s.busy {
		s.mu.Unlock()
		return VideoInfo{}, errors.New("正在读取视频信息")
	}
	s.busy = true
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()

	runner, err := ensureFFmpegRunner()
	if err != nil {
		return VideoInfo{}, fmt.Errorf("准备本地视频处理组件失败：%w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	command := exec.CommandContext(ctx, runner, "-nostdin", "-hide_banner", "-i", source.Path)
	hideAudioCommand(command)
	log, _ := command.CombinedOutput()
	info := parseVideoInfoOutput(source.Name, string(log))
	info.Path = source.Path
	info.Bytes = source.Bytes
	if info.DurationMs == 0 {
		return VideoInfo{}, errors.New("无法读取视频信息，文件可能损坏或格式不受支持")
	}
	return info, nil
}
