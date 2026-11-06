package app

import (
	"archive/zip"
	"bytes"
	"embed"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// ffmpegAssets bundles the LGPL Windows build for fully local media processing.
//
//go:embed third_party/ffmpeg/ffmpeg-win64-lgpl.zip
var ffmpegAssets embed.FS

// ffmpegRuntime caches the extracted FFmpeg location for all media services.
var ffmpegRuntime struct {
	mu   sync.Mutex
	path string
}

// ensureFFmpegRunner extracts the pinned LGPL executable and DLLs into a user
// cache once and returns the ffmpeg.exe path for every caller.
func ensureFFmpegRunner() (string, error) {
	ffmpegRuntime.mu.Lock()
	defer ffmpegRuntime.mu.Unlock()
	if ffmpegRuntime.path != "" {
		return ffmpegRuntime.path, nil
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(cache, "LocalToolbox", "ffmpeg-8.1-lgpl-68d052ea")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	content, err := ffmpegAssets.ReadFile("third_party/ffmpeg/ffmpeg-win64-lgpl.zip")
	if err != nil {
		return "", err
	}
	archive, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return "", err
	}
	for _, entry := range archive.File {
		if filepath.Base(entry.Name) != entry.Name || !(entry.Name == "ffmpeg.exe" || entry.Name == "LICENSE.txt" || strings.HasSuffix(strings.ToLower(entry.Name), ".dll")) {
			return "", errors.New("FFmpeg 组件包包含无效路径")
		}
		path := filepath.Join(dir, entry.Name)
		if info, err := os.Stat(path); err == nil && info.Size() == int64(entry.UncompressedSize64) {
			continue
		}
		input, err := entry.Open()
		if err != nil {
			return "", err
		}
		temp, err := os.CreateTemp(dir, ".ffmpeg-*")
		if err != nil {
			_ = input.Close()
			return "", err
		}
		_, copyErr := io.Copy(temp, input)
		closeErr := temp.Close()
		_ = input.Close()
		if copyErr != nil || closeErr != nil {
			_ = os.Remove(temp.Name())
			return "", errors.Join(copyErr, closeErr)
		}
		_ = os.Remove(path)
		if err := os.Rename(temp.Name(), path); err != nil {
			_ = os.Remove(temp.Name())
			return "", err
		}
	}
	ffmpegRuntime.path = filepath.Join(dir, "ffmpeg.exe")
	return ffmpegRuntime.path, nil
}
