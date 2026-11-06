//go:build windows

package app

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestDeepFilterNet3Runner verifies the bundled Windows CPU binary and model together.
func TestDeepFilterNet3Runner(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.wav")
	file, err := os.Create(input)
	if err != nil {
		t.Fatal(err)
	}
	const frames = 48000
	if err := writePCMHeader(file, frames, 1); err != nil {
		t.Fatal(err)
	}
	data := make([]byte, frames*2)
	for frame := 0; frame < frames; frame++ {
		value := int16(7000 * math.Sin(2*math.Pi*440*float64(frame)/48000))
		binary.LittleEndian.PutUint16(data[frame*2:], uint16(value))
	}
	if _, err := file.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	output, err := runDeepFilter(ctx, dir, input, 50)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(output)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() < 44 {
		t.Fatalf("结果 WAV 过短：%d", info.Size())
	}
}

// TestMP3UploadReplacesWAV verifies the chosen MP3 output keeps no extra WAV.
func TestMP3UploadReplacesWAV(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "voice.wav")
	wav := filepath.Join(dir, "voice_降噪.wav")
	if err := os.WriteFile(source, []byte("source"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(wav, []byte("temporary wav"), 0600); err != nil {
		t.Fatal(err)
	}
	encoded, err := os.ReadFile(filepath.Join("..", "..", "frontend", "src", "tools", "audio-denoise", "testdata", "tone.mp3"))
	if err != nil {
		t.Fatal(err)
	}
	service := NewAudioDenoiseService()
	service.source = source
	service.lastOutput = wav
	if err := service.BeginMP3(int64(len(encoded))); err != nil {
		t.Fatal(err)
	}
	if err := service.AppendMP3(base64.StdEncoding.EncodeToString(encoded)); err != nil {
		t.Fatal(err)
	}
	result, err := service.FinishMP3()
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Ext(result.Path) != ".mp3" || result.Bytes != int64(len(encoded)) {
		t.Fatalf("MP3 结果异常：%+v", result)
	}
	if _, err := os.Stat(wav); !os.IsNotExist(err) {
		t.Fatalf("临时 WAV 未移除：%v", err)
	}
}
