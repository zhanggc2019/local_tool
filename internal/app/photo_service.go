package app

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"example.com/pdf-desktop/internal/imagefile"
	"example.com/pdf-desktop/internal/tools/photoexport"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// PhotoSaveResult lists the two files written for one photo.
type PhotoSaveResult struct {
	JPG string `json:"jpg"`
	PNG string `json:"png"`
}

// PhotoService saves one locally generated ID photo as JPG and PNG.
type PhotoService struct {
	mu         sync.Mutex
	lastOutput string
}

// NewPhotoService creates an independent service for the ID photo tool.
func NewPhotoService() *PhotoService {
	return &PhotoService{}
}

// SavePhoto validates both encodings and opens a native save dialog.
func (s *PhotoService) SavePhoto(size, color, jpegEncoded, pngEncoded string) (PhotoSaveResult, error) {
	return s.savePhoto("", size, color, jpegEncoded, pngEncoded)
}

// SavePhotoBesideSource saves JPG and PNG photos beside their original image.
func (s *PhotoService) SavePhotoBesideSource(sourcePath, size, color, jpegEncoded, pngEncoded string) (PhotoSaveResult, error) {
	return s.savePhoto(sourcePath, size, color, jpegEncoded, pngEncoded)
}

// savePhoto validates both images and chooses either a native dialog or the source directory.
func (s *PhotoService) savePhoto(sourcePath, size, color, jpegEncoded, pngEncoded string) (PhotoSaveResult, error) {
	spec, err := photoexport.SizeSpec(size)
	if err != nil {
		return PhotoSaveResult{}, err
	}
	colorLabel, err := photoexport.ColorLabel(color)
	if err != nil {
		return PhotoSaveResult{}, err
	}
	jpegData, err := photoexport.DecodeJPEG(jpegEncoded, spec)
	if err != nil {
		return PhotoSaveResult{}, err
	}
	pngData, err := photoexport.DecodePNG(pngEncoded, spec)
	if err != nil {
		return PhotoSaveResult{}, err
	}
	var base string
	if sourcePath != "" {
		suffix := "_" + strings.TrimSuffix(photoexport.DefaultFilename(spec, colorLabel), ".jpg")
		base, err = sameSourceOutputBase(sourcePath, suffix, []string{".jpg", ".png"})
		if err != nil {
			return PhotoSaveResult{}, err
		}
	} else {
		app := application.Get()
		if app == nil {
			return PhotoSaveResult{}, errors.New("桌面窗口尚未就绪")
		}
		path, err := app.Dialog.SaveFile().
			SetMessage("保存证件照").
			SetFilename(photoexport.DefaultFilename(spec, colorLabel)).
			AddFilter("JPEG 图片", "*.jpg;*.jpeg").
			PromptForSingleSelection()
		if err != nil || path == "" {
			return PhotoSaveResult{}, err
		}
		base = strings.TrimSuffix(path, filepath.Ext(path))
	}
	jpgPath := base + ".jpg"
	pngPath := base + ".png"
	if err := imagefile.WriteAtomic(jpgPath, jpegData); err != nil {
		return PhotoSaveResult{}, err
	}
	if err := imagefile.WriteAtomic(pngPath, pngData); err != nil {
		_ = os.Remove(jpgPath)
		return PhotoSaveResult{}, err
	}
	s.mu.Lock()
	s.lastOutput = filepath.Dir(jpgPath)
	s.mu.Unlock()
	return PhotoSaveResult{JPG: jpgPath, PNG: pngPath}, nil
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
