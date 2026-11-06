package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// VideoCompressResult summarizes one compressed video.
type VideoCompressResult struct {
	Path       string `json:"path"`
	Bytes      int64  `json:"bytes"`
	InputBytes int64  `json:"inputBytes"`
}

// videoCompressPreset maps a UI preset to a target share of the original size.
type videoCompressPreset struct {
	Label       string
	Description string
	TargetRatio float64
}

// videoCompressPresets defines the selectable compression levels.
var videoCompressPresets = map[string]videoCompressPreset{
	"half":  {Label: "约一半", Description: "画质优先 · 目标约 50%", TargetRatio: 0.5},
	"third": {Label: "约三分之一", Description: "平衡 · 目标约 33%", TargetRatio: 1.0 / 3.0},
	"fifth": {Label: "约五分之一", Description: "体积优先 · 目标约 20%", TargetRatio: 0.2},
}

// compressAudioKbps is the AAC bitrate applied to the kept audio track.
const compressAudioKbps = 96

// compressVideoServiceLimits bound the computed video bitrate.
const (
	compressMinVideoKbps = 100
	compressMaxVideoKbps = 20000
)

// VideoCompressService stores one batch selection and the latest output.
type VideoCompressService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewVideoCompressService creates the native batch video compression service.
func NewVideoCompressService() *VideoCompressService { return &VideoCompressService{} }

// videoCompressPresetIDs lists the preset identifiers for validation.
func videoCompressPresetIDs() []string {
	return []string{"half", "third", "fifth"}
}

// ChooseVideos selects one or up to 50 videos for compression.
func (s *VideoCompressService) ChooseVideos(multiple bool) ([]LocalSource, error) {
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

// durationPattern matches the "Duration: HH:MM:SS.ms" line printed by FFmpeg.
var durationPattern = regexp.MustCompile(`Duration:\s*(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)`)

// parseDurationMillis converts one FFmpeg duration line into milliseconds.
func parseDurationMillis(log string) (int64, bool) {
	match := durationPattern.FindStringSubmatch(log)
	if match == nil {
		return 0, false
	}
	hours, err := strconv.Atoi(match[1])
	if err != nil {
		return 0, false
	}
	minutes, err := strconv.Atoi(match[2])
	if err != nil {
		return 0, false
	}
	seconds, err := strconv.ParseFloat(match[3], 64)
	if err != nil {
		return 0, false
	}
	total := (float64(hours)*3600 + float64(minutes)*60 + seconds) * 1000
	if total <= 0 {
		return 0, false
	}
	return int64(total + 0.5), true
}

// probeVideoInfo reads duration and audio presence from the FFmpeg banner.
func probeVideoInfo(ctx context.Context, runner, source string) (durationMillis int64, hasAudio bool, err error) {
	command := exec.CommandContext(ctx, runner, "-nostdin", "-hide_banner", "-i", source)
	hideAudioCommand(command)
	log, _ := command.CombinedOutput()
	text := string(log)
	durationMillis, ok := parseDurationMillis(text)
	if !ok {
		if index := strings.Index(text, "Duration: N/A"); index >= 0 {
			return 0, false, errors.New("无法读取视频时长")
		}
		return 0, false, errors.New("无法解析视频信息")
	}
	hasAudio = strings.Contains(text, "Audio:")
	return durationMillis, hasAudio, nil
}

// computeVideoKbps converts a target size share into a video bitrate.
func computeVideoKbps(inputBytes int64, durationMillis int64, hasAudio bool, ratio float64) int64 {
	if inputBytes <= 0 || durationMillis <= 0 || ratio <= 0 || ratio > 1 {
		return compressMinVideoKbps
	}
	totalKbps := float64(inputBytes) * 8 / 1000 / (float64(durationMillis) / 1000) * ratio
	if hasAudio {
		totalKbps -= compressAudioKbps
	}
	kbps := int64(totalKbps + 0.5)
	if kbps < compressMinVideoKbps {
		return compressMinVideoKbps
	}
	if kbps > compressMaxVideoKbps {
		return compressMaxVideoKbps
	}
	return kbps
}

// buildCompressArgs assembles the FFmpeg arguments for one target-bitrate encode.
func buildCompressArgs(source, output string, videoKbps int64, hasAudio bool) []string {
	args := []string{
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-i", source,
		"-c:v", "libopenh264", "-rc_mode", "bitrate",
		"-b:v", fmt.Sprintf("%dk", videoKbps),
		"-pix_fmt", "yuv420p",
	}
	if hasAudio {
		args = append(args, "-c:a", "aac", "-b:a", fmt.Sprintf("%dk", compressAudioKbps))
	} else {
		args = append(args, "-an")
	}
	args = append(args, "-movflags", "+faststart", output)
	return args
}

// runFFmpegCompress encodes one video and returns a trimmed failure message.
func runFFmpegCompress(ctx context.Context, runner string, args []string) error {
	if err := runFFmpegCommand(ctx, runner, args); err != nil {
		return fmt.Errorf("视频压缩失败：%w", err)
	}
	return nil
}

// CompressVideo re-encodes one selected video to about the requested size share.
func (s *VideoCompressService) CompressVideo(index int, preset string) (VideoCompressResult, error) {
	spec, ok := videoCompressPresets[preset]
	if !ok {
		return VideoCompressResult{}, errors.New("请选择压缩强度")
	}
	s.mu.Lock()
	if s.busy || index < 0 || index >= len(s.files) {
		s.mu.Unlock()
		return VideoCompressResult{}, errors.New("视频序号无效或已有任务在运行")
	}
	s.busy = true
	source := s.files[index]
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()
	input, err := validateVideoSource(source)
	if err != nil {
		return VideoCompressResult{}, err
	}
	runner, err := ensureFFmpegRunner()
	if err != nil {
		return VideoCompressResult{}, fmt.Errorf("准备本地视频处理组件失败：%w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()
	durationMillis, hasAudio, err := probeVideoInfo(ctx, runner, source)
	if err != nil {
		return VideoCompressResult{}, err
	}
	videoKbps := computeVideoKbps(input.Bytes, durationMillis, hasAudio, spec.TargetRatio)
	output, err := sameSourceOutput(source, "_压缩", ".mp4")
	if err != nil {
		return VideoCompressResult{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(output), ".video-compress-*.mp4")
	if err != nil {
		return VideoCompressResult{}, err
	}
	tempPath := temp.Name()
	_ = temp.Close()
	defer os.Remove(tempPath)
	if err := runFFmpegCompress(ctx, runner, buildCompressArgs(source, tempPath, videoKbps, hasAudio)); err != nil {
		return VideoCompressResult{}, err
	}
	info, err := os.Stat(tempPath)
	if err != nil || info.Size() < 1024 {
		return VideoCompressResult{}, errors.New("视频压缩结果为空")
	}
	if err := os.Rename(tempPath, output); err != nil {
		return VideoCompressResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	return VideoCompressResult{Path: output, Bytes: info.Size(), InputBytes: input.Bytes}, nil
}

// OpenVideoCompressOutputFolder opens the latest output directory.
func (s *VideoCompressService) OpenVideoCompressOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已压缩的视频")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
