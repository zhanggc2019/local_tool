package main

import (
	"embed"
	"log"

	"example.com/pdf-desktop/internal/app"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// assets embeds the built frontend so the application works entirely offline.
//
//go:embed all:frontend/dist
var assets embed.FS

// main registers each tool as its own service and starts the desktop window.
// All tool implementations live in internal/app.
func main() {
	desktop := application.New(application.Options{
		Name:        "本地工具箱",
		Description: "本地文件与图片工具箱",
		Services: []application.Service{
			application.NewService(app.NewSourceFileService()),
			application.NewService(app.NewPDFExportService()),
			application.NewService(app.NewPDFManageService()),
			application.NewService(app.NewPDFPageService()),
			application.NewService(app.NewPDFWatermarkService()),
			application.NewService(app.NewPDFCryptoService()),
			application.NewService(app.NewTextOutputService()),
			application.NewService(app.NewPhotoService()),
			application.NewService(app.NewWatermarkService()),
			application.NewService(app.NewImageConvertService()),
			application.NewService(app.NewGeneratedImageService()),
			application.NewService(app.NewQRCodeService()),
			application.NewService(app.NewPortService()),
			application.NewService(app.NewAudioDenoiseService()),
			application.NewService(app.NewVideoAudioService()),
			application.NewService(app.NewVideoCompressService()),
			application.NewService(app.NewVideoTrimService()),
			application.NewService(app.NewVideoGIFService()),
			application.NewService(app.NewVideoFrameService()),
			application.NewService(app.NewVideoConvertService()),
			application.NewService(app.NewVideoMergeService()),
			application.NewService(app.NewVideoInfoService()),
			application.NewService(app.NewVideoSpeedService()),
			application.NewService(app.NewVolumeNormalizeService()),
			application.NewService(app.NewAudioTrimService()),
			application.NewService(app.NewImagePDFService()),
			application.NewService(app.NewCutoutService()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	desktop.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "本地工具箱",
		Width:            1180,
		Height:           780,
		MinWidth:         860,
		MinHeight:        620,
		BackgroundColour: application.NewRGB(247, 246, 242),
		URL:              "/",
	})

	if err := desktop.Run(); err != nil {
		log.Fatal(err)
	}
}
