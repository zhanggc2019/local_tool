package app

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// chooseVideoSources opens the native picker and validates one or more videos.
func chooseVideoSources(multiple bool) ([]LocalSource, error) {
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
	return result, nil
}

// formatTimecodeMs renders milliseconds as h:mm:ss or m:ss for messages.
func formatTimecodeMs(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	totalSeconds := (ms + 500) / 1000
	hours := totalSeconds / 3600
	minutes := (totalSeconds % 3600) / 60
	seconds := totalSeconds % 60
	if hours > 0 {
		return fmt.Sprintf("%d:%02d:%02d", hours, minutes, seconds)
	}
	return fmt.Sprintf("%d:%02d", minutes, seconds)
}

// localSourcePaths extracts the native paths from selected sources.
func localSourcePaths(sources []LocalSource) []string {
	paths := make([]string, len(sources))
	for index, source := range sources {
		paths[index] = source.Path
	}
	return paths
}

// runFFmpegCommand executes FFmpeg with console hiding and a trimmed error.
func runFFmpegCommand(ctx context.Context, runner string, args []string) error {
	command := exec.CommandContext(ctx, runner, args...)
	hideAudioCommand(command)
	log, err := command.CombinedOutput()
	if err == nil {
		return nil
	}
	message := strings.TrimSpace(string(log))
	if len(message) > 500 {
		message = message[len(message)-500:]
	}
	return fmt.Errorf("处理失败：%w：%s", err, message)
}
