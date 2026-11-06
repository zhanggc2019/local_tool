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

// VideoMergeModes lists the supported merge strategies.
var VideoMergeModes = []string{"fast", "precise"}

// videoStreamInfo captures the details needed to normalize merge inputs.
type videoStreamInfo struct {
	DurationMs int64
	Width      int
	Height     int
	FPS        float64
	HasAudio   bool
}

// videoSizePattern matches "160x90" inside an FFmpeg stream line.
var videoSizePattern = regexp.MustCompile(`,\s*(\d{2,5})x(\d{2,5})[\s,\[]`)

// videoFPSPattern matches the frame rate on a video stream line.
var videoFPSPattern = regexp.MustCompile(`([\d.]+)\s+fps`)

// parseVideoStreamInfo extracts duration, resolution, frame rate, and audio.
func parseVideoStreamInfo(log string) (videoStreamInfo, error) {
	info := videoStreamInfo{}
	duration, ok := parseDurationMillis(log)
	if !ok {
		return info, errors.New("无法读取视频时长")
	}
	info.DurationMs = duration
	videoLine := ""
	for _, line := range strings.Split(log, "\n") {
		if strings.Contains(line, "Video:") {
			videoLine = line
			break
		}
	}
	if videoLine == "" {
		return info, errors.New("视频没有画面轨道")
	}
	if match := videoSizePattern.FindStringSubmatch(videoLine); match != nil {
		info.Width, _ = strconv.Atoi(match[1])
		info.Height, _ = strconv.Atoi(match[2])
	}
	if info.Width < 1 || info.Height < 1 {
		return info, errors.New("无法读取视频分辨率")
	}
	if match := videoFPSPattern.FindStringSubmatch(videoLine); match != nil {
		info.FPS, _ = strconv.ParseFloat(match[1], 64)
	}
	if info.FPS <= 0 || info.FPS > 240 {
		info.FPS = 25
	}
	info.HasAudio = strings.Contains(log, "Audio:")
	return info, nil
}

// probeVideoStreams reads the FFmpeg banner for one input.
func probeVideoStreams(ctx context.Context, runner, source string) (videoStreamInfo, error) {
	command := exec.CommandContext(ctx, runner, "-nostdin", "-hide_banner", "-i", source)
	hideAudioCommand(command)
	log, _ := command.CombinedOutput()
	return parseVideoStreamInfo(string(log))
}

// validateVideoMergeMode checks one merge mode from the frontend.
func validateVideoMergeMode(mode string) error {
	for _, candidate := range VideoMergeModes {
		if candidate == mode {
			return nil
		}
	}
	return errors.New("请选择合并方式")
}

// buildConcatList renders the FFmpeg concat demuxer input file.
func buildConcatList(paths []string) string {
	var builder strings.Builder
	for _, path := range paths {
		escaped := strings.ReplaceAll(path, "'", `'\''`)
		fmt.Fprintf(&builder, "file '%s'\n", escaped)
	}
	return builder.String()
}

// formatFilterFPS renders a frame rate without trailing zeros.
func formatFilterFPS(fps float64) string {
	if fps <= 0 || fps > 240 {
		fps = 25
	}
	return strconv.FormatFloat(fps, 'f', -1, 64)
}

// buildMergeFilter normalizes every input to the first video's frame size and
// supplies silence for inputs without an audio track.
func buildMergeFilter(infos []videoStreamInfo, width, height int, fps float64) string {
	parts := make([]string, 0, len(infos)*2+1)
	var concatInputs strings.Builder
	for index, info := range infos {
		parts = append(parts, fmt.Sprintf(
			"[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=%s,format=yuv420p[v%d]",
			index, width, height, width, height, formatFilterFPS(fps), index,
		))
		if info.HasAudio {
			parts = append(parts, fmt.Sprintf(
				"[%d:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a%d]", index, index,
			))
		} else {
			seconds := float64(info.DurationMs) / 1000
			parts = append(parts, fmt.Sprintf(
				"anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=%.3f[a%d]", seconds, index,
			))
		}
		fmt.Fprintf(&concatInputs, "[v%d][a%d]", index, index)
	}
	parts = append(parts, fmt.Sprintf("%sconcat=n=%d:v=1:a=1[v][a]", concatInputs.String(), len(infos)))
	return strings.Join(parts, ";")
}

// mergeOutputExtension picks a container for the requested mode.
func mergeOutputExtension(sourcePath, mode string) string {
	if mode == "precise" {
		return ".mp4"
	}
	extension := strings.ToLower(filepath.Ext(sourcePath))
	switch extension {
	case ".mp4", ".mov", ".mkv", ".webm":
		return extension
	}
	return ".mkv"
}

// VideoMergeService stores one ordered selection and the latest output.
type VideoMergeService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewVideoMergeService creates the native video merge service.
func NewVideoMergeService() *VideoMergeService { return &VideoMergeService{} }

// ChooseVideos selects at least two videos for merging.
func (s *VideoMergeService) ChooseVideos(multiple bool) ([]LocalSource, error) {
	s.mu.Lock()
	busy := s.busy
	s.mu.Unlock()
	if busy {
		return nil, errors.New("请等待当前合并任务完成")
	}
	result, err := chooseVideoSources(true)
	if err != nil {
		return nil, err
	}
	if len(result) < 2 {
		return nil, errors.New("视频合并至少需要两个视频")
	}
	s.mu.Lock()
	s.files = localSourcePaths(result)
	s.lastOutput = ""
	s.mu.Unlock()
	return result, nil
}

// MergeVideos joins the selected videos in the requested order.
func (s *VideoMergeService) MergeVideos(order []int, mode string) (VideoCompressResult, error) {
	if err := validateVideoMergeMode(mode); err != nil {
		return VideoCompressResult{}, err
	}
	s.mu.Lock()
	if s.busy {
		s.mu.Unlock()
		return VideoCompressResult{}, errors.New("已有合并任务在运行")
	}
	if len(s.files) < 2 {
		s.mu.Unlock()
		return VideoCompressResult{}, errors.New("请先选择至少两个视频")
	}
	if len(order) != len(s.files) {
		s.mu.Unlock()
		return VideoCompressResult{}, errors.New("视频顺序无效")
	}
	seen := make(map[int]bool, len(order))
	ordered := make([]string, len(order))
	for position, index := range order {
		if index < 0 || index >= len(s.files) || seen[index] {
			s.mu.Unlock()
			return VideoCompressResult{}, errors.New("视频顺序无效")
		}
		seen[index] = true
		ordered[position] = s.files[index]
	}
	s.busy = true
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()

	var inputBytes int64
	for _, path := range ordered {
		input, err := validateVideoSource(path)
		if err != nil {
			return VideoCompressResult{}, err
		}
		inputBytes += input.Bytes
	}
	runner, err := ensureFFmpegRunner()
	if err != nil {
		return VideoCompressResult{}, fmt.Errorf("准备本地视频处理组件失败：%w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Minute)
	defer cancel()

	extension := mergeOutputExtension(ordered[0], mode)
	output, err := sameSourceOutput(ordered[0], "_合并", extension)
	if err != nil {
		return VideoCompressResult{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(output), ".video-merge-*"+extension)
	if err != nil {
		return VideoCompressResult{}, err
	}
	tempPath := temp.Name()
	_ = temp.Close()
	defer os.Remove(tempPath)

	if mode == "fast" {
		if err := runMergeFast(ctx, runner, ordered, tempPath, extension); err != nil {
			return VideoCompressResult{}, err
		}
	} else {
		infos := make([]videoStreamInfo, len(ordered))
		var totalDuration int64
		for index, path := range ordered {
			info, err := probeVideoStreams(ctx, runner, path)
			if err != nil {
				return VideoCompressResult{}, fmt.Errorf("%s：%w", filepath.Base(path), err)
			}
			infos[index] = info
			totalDuration += info.DurationMs
		}
		videoKbps := computeVideoKbps(inputBytes, totalDuration, true, 0.9)
		if err := runMergePrecise(ctx, runner, ordered, tempPath, infos, videoKbps); err != nil {
			return VideoCompressResult{}, err
		}
	}

	info, err := os.Stat(tempPath)
	if err != nil || info.Size() < 1024 {
		return VideoCompressResult{}, errors.New("视频合并结果为空")
	}
	if err := os.Rename(tempPath, output); err != nil {
		return VideoCompressResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	return VideoCompressResult{Path: output, Bytes: info.Size(), InputBytes: inputBytes}, nil
}

// runMergeFast joins streams without re-encoding.
func runMergeFast(ctx context.Context, runner string, paths []string, output, extension string) error {
	listDir, err := os.MkdirTemp(filepath.Dir(output), ".video-merge-list-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(listDir)
	listPath := filepath.Join(listDir, "list.txt")
	if err := os.WriteFile(listPath, []byte(buildConcatList(paths)), 0600); err != nil {
		return err
	}
	args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy"}
	if extension == ".mp4" || extension == ".mov" {
		args = append(args, "-movflags", "+faststart")
	}
	args = append(args, output)
	if err := runFFmpegCommand(ctx, runner, args); err != nil {
		return fmt.Errorf("快速合并失败，所选视频的编码参数可能不一致，请改用兼容合并：%w", err)
	}
	return nil
}

// runMergePrecise re-encodes every input so mismatched sources can be joined.
func runMergePrecise(ctx context.Context, runner string, paths []string, output string, infos []videoStreamInfo, videoKbps int64) error {
	args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y"}
	for _, path := range paths {
		args = append(args, "-i", path)
	}
	first := infos[0]
	filter := buildMergeFilter(infos, first.Width, first.Height, first.FPS)
	args = append(args,
		"-filter_complex", filter,
		"-map", "[v]", "-map", "[a]",
		"-c:v", "libopenh264", "-rc_mode", "bitrate", "-b:v", fmt.Sprintf("%dk", videoKbps),
		"-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "128k",
		"-movflags", "+faststart",
		output,
	)
	if err := runFFmpegCommand(ctx, runner, args); err != nil {
		return fmt.Errorf("兼容合并失败：%w", err)
	}
	return nil
}

// OpenVideoMergeOutputFolder opens the latest output directory.
func (s *VideoMergeService) OpenVideoMergeOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已合并的视频")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
