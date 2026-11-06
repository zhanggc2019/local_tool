package app

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// audioDialogFilter lists audio formats handled by the media services.
const audioDialogFilter = "*.mp3;*.wav;*.m4a;*.aac;*.flac;*.ogg"

// audioExtensions is the supported audio format set.
var audioExtensions = map[string]bool{
	".mp3": true, ".wav": true, ".m4a": true, ".aac": true, ".flac": true, ".ogg": true,
}

// validateAudioSource checks one audio file and its size.
func validateMediaAudioSource(path string) (LocalSource, error) {
	if !audioExtensions[strings.ToLower(filepath.Ext(path))] {
		return LocalSource{}, errors.New("音频格式不受支持")
	}
	info, err := os.Stat(path)
	if err != nil {
		return LocalSource{}, err
	}
	if info.IsDir() || info.Size() < 1 || info.Size() > 200*1024*1024 {
		return LocalSource{}, errors.New("音频为空或超过 200 MB")
	}
	return LocalSource{Name: info.Name(), Path: path, Bytes: info.Size()}, nil
}

// chooseAudioSources opens the native picker for audio files.
func chooseAudioSources(multiple bool) ([]LocalSource, error) {
	app := application.Get()
	if app == nil {
		return nil, errors.New("桌面窗口尚未就绪")
	}
	dialog := app.Dialog.OpenFile().SetTitle("选择音频").AddFilter("音频文件", audioDialogFilter)
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
		return nil, errors.New("一次最多选择 50 个音频")
	}
	result := make([]LocalSource, 0, len(paths))
	for _, path := range paths {
		file, err := validateMediaAudioSource(path)
		if err != nil {
			return nil, fmt.Errorf("%s：%w", filepath.Base(path), err)
		}
		result = append(result, file)
	}
	return result, nil
}
