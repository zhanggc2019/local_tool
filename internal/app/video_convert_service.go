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

// VideoConvertTargets lists the supported output containers.
var VideoConvertTargets = []string{"mp4", "mkv", "webm"}

// validateVideoConvertTarget checks the requested container.
func validateVideoConvertTarget(target string) error {
	for _, candidate := range VideoConvertTargets {
		if candidate == target {
			return nil
		}
	}
	return errors.New("请选择输出格式")
}

// VideoConvertService stores one batch selection and the latest output.
type VideoConvertService struct {
	mu         sync.Mutex
	files      []string
	lastOutput string
	busy       bool
}

// NewVideoConvertService creates the native video format conversion service.
func NewVideoConvertService() *VideoConvertService { return &VideoConvertService{} }

// ChooseVideos selects one or up to 50 videos for conversion.
func (s *VideoConvertService) ChooseVideos(multiple bool) ([]LocalSource, error) {
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

// buildConvertArgs assembles the FFmpeg arguments for one target container.
func buildConvertArgs(source, output, target string, videoKbps int64, hasAudio bool) []string {
	args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", source}
	switch target {
	case "mp4":
		// MP4 sources are remuxed; other containers are re-encoded for compatibility.
		if strings.EqualFold(filepath.Ext(source), ".mp4") {
			args = append(args, "-c", "copy")
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
		}
		args = append(args, "-sn", "-dn", "-movflags", "+faststart")
	case "mkv":
		// Matroska accepts nearly every codec, so a stream copy is lossless and fast.
		args = append(args, "-c", "copy", "-sn", "-dn")
	case "webm":
		args = append(args,
			"-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1",
			"-pix_fmt", "yuv420p",
		)
		if hasAudio {
			args = append(args, "-c:a", "libopus", "-b:a", "96k")
		} else {
			args = append(args, "-an")
		}
		args = append(args, "-sn", "-dn")
	}
	args = append(args, output)
	return args
}

// ConvertVideo converts one selected video to the requested container.
func (s *VideoConvertService) ConvertVideo(index int, target string) (VideoCompressResult, error) {
	if err := validateVideoConvertTarget(target); err != nil {
		return VideoCompressResult{}, err
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
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Minute)
	defer cancel()
	durationMillis, hasAudio, err := probeVideoInfo(ctx, runner, source)
	if err != nil {
		return VideoCompressResult{}, err
	}
	videoKbps := computeVideoKbps(input.Bytes, durationMillis, hasAudio, 0.9)
	output, err := sameSourceOutput(source, "_转换", "."+target)
	if err != nil {
		return VideoCompressResult{}, err
	}
	temp, err := os.CreateTemp(filepath.Dir(output), ".video-convert-*."+target)
	if err != nil {
		return VideoCompressResult{}, err
	}
	tempPath := temp.Name()
	_ = temp.Close()
	defer os.Remove(tempPath)
	if err := runFFmpegCommand(ctx, runner, buildConvertArgs(source, tempPath, target, videoKbps, hasAudio)); err != nil {
		return VideoCompressResult{}, fmt.Errorf("视频格式转换失败：%w", err)
	}
	info, err := os.Stat(tempPath)
	if err != nil || info.Size() < 1024 {
		return VideoCompressResult{}, errors.New("视频格式转换结果为空")
	}
	if err := os.Rename(tempPath, output); err != nil {
		return VideoCompressResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = output
	s.mu.Unlock()
	return VideoCompressResult{Path: output, Bytes: info.Size(), InputBytes: input.Bytes}, nil
}

// OpenVideoConvertOutputFolder opens the latest output directory.
func (s *VideoConvertService) OpenVideoConvertOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已转换的视频")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
