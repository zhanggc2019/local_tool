package main

import (
	"errors"
	"path/filepath"
	"strings"
	"sync"

	"example.com/pdf-desktop/internal/imagefile"
	"example.com/pdf-desktop/internal/tools/photoexport"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// PhotoService saves one locally generated ID photo at a user-selected path.
type PhotoService struct {
	mu         sync.Mutex
	lastOutput string
}

// NewPhotoService creates an independent service for the ID photo tool.
func NewPhotoService() *PhotoService {
	return &PhotoService{}
}

// SavePhoto validates the JPEG and opens a native save dialog.
func (s *PhotoService) SavePhoto(size, color, encoded string) (string, error) {
	spec, err := photoexport.SizeSpec(size)
	if err != nil {
		return "", err
	}
	colorLabel, err := photoexport.ColorLabel(color)
	if err != nil {
		return "", err
	}
	data, err := photoexport.DecodeJPEG(encoded, spec)
	if err != nil {
		return "", err
	}
	app := application.Get()
	if app == nil {
		return "", errors.New("桌面窗口尚未就绪")
	}
	path, err := app.Dialog.SaveFile().
		SetMessage("保存证件照").
		SetFilename(photoexport.DefaultFilename(spec, colorLabel)).
		AddFilter("JPEG 图片", "*.jpg;*.jpeg").
		PromptForSingleSelection()
	if err != nil || path == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(path), ".jpg") && !strings.EqualFold(filepath.Ext(path), ".jpeg") {
		path += ".jpg"
	}
	if err := imagefile.WriteAtomic(path, data); err != nil {
		return "", err
	}
	s.mu.Lock()
	s.lastOutput = filepath.Dir(path)
	s.mu.Unlock()
	return path, nil
}

// OpenPhotoOutputFolder opens the directory used by the latest saved photo.
func (s *PhotoService) OpenPhotoOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已保存的证件照")
	}
	return application.Get().Env.OpenFileManager(path, false)
}
