package main

import (
	"context"
	"embed"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const audioChunkLimit = 2 * 1024 * 1024
const maxAudioFrames = 48000 * 10 * 60

// deepFilterAssets bundles the official CPU runner and DeepFilterNet3 weights for offline use.
//
//go:embed third_party/deepfilter/deep-filter.exe third_party/deepfilter/DeepFilterNet3_onnx.tar.gz
var deepFilterAssets embed.FS

// AudioResult describes a saved WAV that is ready for preview.
type AudioResult struct {
	Path  string `json:"path"`
	Bytes int64  `json:"bytes"`
}

// audioImport tracks one normalized PCM upload until it is processed.
type audioImport struct {
	dir      string
	path     string
	file     *os.File
	expected int64
	written  int64
	strength int
}

// mp3Import tracks one encoded MP3 upload before it replaces a temporary WAV result.
type mp3Import struct {
	path     string
	file     *os.File
	expected int64
	written  int64
}

// AudioDenoiseService owns the selected audio, PCM upload, and latest output.
type AudioDenoiseService struct {
	mu         sync.Mutex
	source     string
	current    *audioImport
	mp3        *mp3Import
	lastOutput string
	busy       bool
}

// NewAudioDenoiseService creates an independent offline speech enhancement service.
func NewAudioDenoiseService() *AudioDenoiseService { return &AudioDenoiseService{} }

// validateAudioSource accepts browser-decodable audio within the local memory budget.
func validateAudioSource(path string) (LocalSource, error) {
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".wav" && ext != ".mp3" && ext != ".m4a" {
		return LocalSource{}, errors.New("仅支持 WAV、MP3 或 M4A 音频")
	}
	info, err := os.Stat(path)
	if err != nil {
		return LocalSource{}, err
	}
	if info.IsDir() || info.Size() < 1 || info.Size() > 40*1024*1024 {
		return LocalSource{}, errors.New("音频为空或超过 40 MB")
	}
	return LocalSource{Name: info.Name(), Path: path, Bytes: info.Size()}, nil
}

// ChooseAudio opens a native picker and remembers one source file.
func (s *AudioDenoiseService) ChooseAudio() (LocalSource, error) {
	s.mu.Lock()
	if s.busy || s.current != nil || s.mp3 != nil {
		s.mu.Unlock()
		return LocalSource{}, errors.New("请等待当前降噪任务完成")
	}
	s.mu.Unlock()
	app := application.Get()
	if app == nil {
		return LocalSource{}, errors.New("桌面窗口尚未就绪")
	}
	path, err := app.Dialog.OpenFile().SetTitle("选择音频").AddFilter("音频文件", "*.wav;*.mp3;*.m4a").PromptForSingleSelection()
	if err != nil || path == "" {
		return LocalSource{}, err
	}
	source, err := validateAudioSource(path)
	if err != nil {
		return LocalSource{}, err
	}
	s.mu.Lock()
	s.source = path
	s.lastOutput = ""
	s.mu.Unlock()
	return source, nil
}

// readAudioChunk reads a bounded file slice for browser playback.
func readAudioChunk(path string, offset int64) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if offset < 0 || offset >= info.Size() {
		return "", errors.New("音频读取位置无效")
	}
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	if _, err := file.Seek(offset, io.SeekStart); err != nil {
		return "", err
	}
	length := int64(audioChunkLimit)
	if remaining := info.Size() - offset; remaining < length {
		length = remaining
	}
	data := make([]byte, length)
	if _, err := io.ReadFull(file, data); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// ReadAudioChunk streams the selected original file to the local webview.
func (s *AudioDenoiseService) ReadAudioChunk(offset int64) (string, error) {
	s.mu.Lock()
	path := s.source
	s.mu.Unlock()
	if path == "" {
		return "", errors.New("请先选择音频")
	}
	if _, err := validateAudioSource(path); err != nil {
		return "", err
	}
	return readAudioChunk(path, offset)
}

// writePCMHeader writes a 48 kHz, 16-bit RIFF header for the complete upload.
func writePCMHeader(writer io.Writer, frames, channels int) error {
	dataBytes := uint32(frames * channels * 2)
	header := make([]byte, 44)
	copy(header[0:4], "RIFF")
	binary.LittleEndian.PutUint32(header[4:8], dataBytes+36)
	copy(header[8:12], "WAVE")
	copy(header[12:16], "fmt ")
	binary.LittleEndian.PutUint32(header[16:20], 16)
	binary.LittleEndian.PutUint16(header[20:22], 1)
	binary.LittleEndian.PutUint16(header[22:24], uint16(channels))
	binary.LittleEndian.PutUint32(header[24:28], 48000)
	binary.LittleEndian.PutUint32(header[28:32], uint32(48000*channels*2))
	binary.LittleEndian.PutUint16(header[32:34], uint16(channels*2))
	binary.LittleEndian.PutUint16(header[34:36], 16)
	copy(header[36:40], "data")
	binary.LittleEndian.PutUint32(header[40:44], dataBytes)
	_, err := writer.Write(header)
	return err
}

// BeginAudio creates a temporary 48 kHz WAV for decoded browser audio.
func (s *AudioDenoiseService) BeginAudio(frames, channels, strength int) error {
	if frames < 1 || frames > maxAudioFrames || (channels != 1 && channels != 2) {
		return errors.New("音频需为 10 分钟以内的单声道或双声道")
	}
	if strength < 0 || strength > 100 {
		return errors.New("降噪强度需在 0 到 100 之间")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.source == "" || s.busy || s.current != nil || s.mp3 != nil {
		return errors.New("请先选择音频并等待当前任务结束")
	}
	if _, err := validateAudioSource(s.source); err != nil {
		return err
	}
	dir, err := os.MkdirTemp("", "local-toolbox-audio-*")
	if err != nil {
		return err
	}
	path := filepath.Join(dir, "input.wav")
	file, err := os.Create(path)
	if err == nil {
		err = writePCMHeader(file, frames, channels)
	}
	if err != nil {
		if file != nil {
			_ = file.Close()
		}
		_ = os.RemoveAll(dir)
		return err
	}
	s.current = &audioImport{dir: dir, path: path, file: file, expected: int64(frames * channels * 2), strength: strength}
	s.lastOutput = ""
	return nil
}

// AppendAudio adds one bounded PCM16 chunk to the current WAV.
func (s *AudioDenoiseService) AppendAudio(encoded string) error {
	if len(encoded) > 4*audioChunkLimit/3+8 {
		return errors.New("音频数据块过大")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 || len(data) > audioChunkLimit || len(data)%2 != 0 {
		return errors.New("音频数据块无效")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	item := s.current
	if item == nil || s.busy || item.written+int64(len(data)) > item.expected {
		return errors.New("音频上传状态无效")
	}
	n, err := item.file.Write(data)
	item.written += int64(n)
	return err
}

// CancelAudio discards an incomplete PCM upload so the user can retry safely.
func (s *AudioDenoiseService) CancelAudio() error {
	s.mu.Lock()
	if s.busy {
		s.mu.Unlock()
		return errors.New("降噪正在进行，无法取消")
	}
	item := s.current
	s.current = nil
	s.mu.Unlock()
	if item == nil {
		return nil
	}
	_ = item.file.Close()
	return os.RemoveAll(item.dir)
}

// BeginMP3 opens a bounded local upload for the browser-encoded MP3 result.
func (s *AudioDenoiseService) BeginMP3(bytes int64) error {
	if bytes < 128 || bytes > 40*1024*1024 {
		return errors.New("MP3 文件大小无效")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.busy || s.current != nil || s.mp3 != nil || !strings.EqualFold(filepath.Ext(s.lastOutput), ".wav") {
		return errors.New("请先完成 WAV 降噪")
	}
	file, err := os.CreateTemp(filepath.Dir(s.lastOutput), ".audio-mp3-*.tmp")
	if err != nil {
		return err
	}
	s.mp3 = &mp3Import{path: file.Name(), file: file, expected: bytes}
	return nil
}

// AppendMP3 writes one encoded MP3 chunk without loading the whole file in Go.
func (s *AudioDenoiseService) AppendMP3(encoded string) error {
	if len(encoded) > 4*audioChunkLimit/3+8 {
		return errors.New("MP3 数据块过大")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 || len(data) > audioChunkLimit {
		return errors.New("MP3 数据块无效")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	item := s.mp3
	if item == nil || s.busy || item.written+int64(len(data)) > item.expected {
		return errors.New("MP3 上传状态无效")
	}
	n, err := item.file.Write(data)
	item.written += int64(n)
	return err
}

// CancelMP3 removes an incomplete encoded upload while keeping the WAV fallback.
func (s *AudioDenoiseService) CancelMP3() error {
	s.mu.Lock()
	if s.busy {
		s.mu.Unlock()
		return errors.New("MP3 正在保存，无法取消")
	}
	item := s.mp3
	s.mp3 = nil
	s.mu.Unlock()
	if item == nil {
		return nil
	}
	_ = item.file.Close()
	return os.Remove(item.path)
}

// FinishMP3 validates and saves the encoded output, then removes its WAV fallback.
func (s *AudioDenoiseService) FinishMP3() (AudioResult, error) {
	s.mu.Lock()
	item := s.mp3
	if item == nil || s.busy || item.written != item.expected {
		s.mu.Unlock()
		return AudioResult{}, errors.New("MP3 上传未完成")
	}
	s.mp3 = nil
	s.busy = true
	source := s.source
	wavPath := s.lastOutput
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()
	defer os.Remove(item.path)
	if err := item.file.Close(); err != nil {
		return AudioResult{}, err
	}
	file, err := os.Open(item.path)
	if err != nil {
		return AudioResult{}, err
	}
	header := make([]byte, 3)
	_, err = io.ReadFull(file, header)
	_ = file.Close()
	if err != nil || !(string(header) == "ID3" || (header[0] == 0xff && header[1]&0xe0 == 0xe0)) {
		return AudioResult{}, errors.New("MP3 编码结果无效")
	}
	path, err := sameSourceOutput(source, "_降噪", ".mp3")
	if err != nil {
		return AudioResult{}, err
	}
	if err := os.Rename(item.path, path); err != nil {
		return AudioResult{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return AudioResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = path
	s.mu.Unlock()
	_ = os.Remove(wavPath)
	return AudioResult{Path: path, Bytes: info.Size()}, nil
}

// extractDeepFilter copies bundled runner and model into an isolated task folder.
func extractDeepFilter(dir string) (string, string, error) {
	paths := []string{"deep-filter.exe", "DeepFilterNet3_onnx.tar.gz"}
	for _, name := range paths {
		data, err := deepFilterAssets.ReadFile("third_party/deepfilter/" + name)
		if err != nil {
			return "", "", err
		}
		if err := os.WriteFile(filepath.Join(dir, name), data, 0600); err != nil {
			return "", "", err
		}
	}
	return filepath.Join(dir, paths[0]), filepath.Join(dir, paths[1]), nil
}

// runDeepFilter invokes the official CPU implementation without a visible console.
func runDeepFilter(ctx context.Context, dir, input string, strength int) (string, error) {
	binaryPath, modelPath, err := extractDeepFilter(dir)
	if err != nil {
		return "", err
	}
	outDir := filepath.Join(dir, "out")
	if err := os.Mkdir(outDir, 0700); err != nil {
		return "", err
	}
	args := []string{"-m", modelPath, "-D", "-o", outDir, "--atten-lim-db", strconv.Itoa(strength)}
	if strength >= 85 {
		args = append(args, "--pf")
	}
	args = append(args, input)
	command := exec.CommandContext(ctx, binaryPath, args...)
	hideAudioCommand(command)
	output, err := command.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("DeepFilterNet3 处理失败：%w：%s", err, strings.TrimSpace(string(output)))
	}
	result := filepath.Join(outDir, "input.wav")
	if _, err := os.Stat(result); err != nil {
		return "", errors.New("DeepFilterNet3 未生成音频文件")
	}
	return result, nil
}

// copyAudioAtomic saves a processed WAV beside its source without replacing files.
func copyAudioAtomic(source, dest string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.CreateTemp(filepath.Dir(dest), ".audio-denoise-*.wav")
	if err != nil {
		return err
	}
	temp := out.Name()
	defer os.Remove(temp)
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	return os.Rename(temp, dest)
}

// FinishAudio runs DeepFilterNet3 and saves the enhanced WAV beside the input.
func (s *AudioDenoiseService) FinishAudio() (AudioResult, error) {
	s.mu.Lock()
	item := s.current
	if item == nil || s.busy || item.written != item.expected {
		s.mu.Unlock()
		return AudioResult{}, errors.New("音频上传未完成")
	}
	s.busy = true
	s.current = nil
	source := s.source
	s.mu.Unlock()
	defer os.RemoveAll(item.dir)
	defer func() { s.mu.Lock(); s.busy = false; s.mu.Unlock() }()
	if err := item.file.Close(); err != nil {
		return AudioResult{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	processed, err := runDeepFilter(ctx, item.dir, item.path, item.strength)
	if err != nil {
		return AudioResult{}, err
	}
	path, err := sameSourceOutput(source, "_降噪", ".wav")
	if err != nil {
		return AudioResult{}, err
	}
	if err := copyAudioAtomic(processed, path); err != nil {
		return AudioResult{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return AudioResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = path
	s.mu.Unlock()
	return AudioResult{Path: path, Bytes: info.Size()}, nil
}

// ReadResultChunk streams the latest output to the local playback control.
func (s *AudioDenoiseService) ReadResultChunk(offset int64) (string, error) {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return "", errors.New("还没有降噪结果")
	}
	return readAudioChunk(path, offset)
}

// OpenAudioOutputFolder reveals the latest saved result in File Explorer.
func (s *AudioDenoiseService) OpenAudioOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有降噪结果")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(filepath.Dir(path), false)
}
