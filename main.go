package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// assets embeds the built frontend so the application works entirely offline.
//
//go:embed all:frontend/dist
var assets embed.FS

// main registers each tool as its own service and starts the desktop window.
func main() {
	app := application.New(application.Options{
		Name:        "本地工具箱",
		Description: "本地文件与图片工具箱",
		Services: []application.Service{
			application.NewService(NewSourceFileService()),
			application.NewService(NewPDFExportService()),
			application.NewService(NewPDFManageService()),
			application.NewService(NewPhotoService()),
			application.NewService(NewWatermarkService()),
			application.NewService(NewQRCodeService()),
			application.NewService(NewPortService()),
			application.NewService(NewAudioDenoiseService()),
			application.NewService(NewVideoAudioService()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "本地工具箱",
		Width:            1180,
		Height:           780,
		MinWidth:         860,
		MinHeight:        620,
		BackgroundColour: application.NewRGB(247, 246, 242),
		URL:              "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
