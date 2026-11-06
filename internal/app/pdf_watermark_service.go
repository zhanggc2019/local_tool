package app

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/font"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// watermarkColorPattern accepts the #RRGGBB form used by the interface.
var watermarkColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// cjkWatermarkFont caches the installed system CJK font for the process.
var cjkWatermarkFont struct {
	once sync.Once
	name string
	err  error
}

// containsCJK reports whether the text needs a CJK-capable font.
func containsCJK(text string) bool {
	for _, r := range text {
		if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) ||
			unicode.Is(unicode.Katakana, r) || unicode.Is(unicode.Hangul, r) {
			return true
		}
	}
	return false
}

// cjkFontCandidates lists system TrueType fonts that contain CJK glyphs.
var cjkFontCandidates = []string{"simhei.ttf", "Deng.ttf", "NotoSansSC-VF.ttf", "simkai.ttf"}

// cjkWatermarkFontName is the display name handed to pdfcpu; the installed
// font is registered under its PostScript name, which is discovered after
// installation.
const cjkWatermarkFontName = "LocalToolboxCJK"

// newestInstalledFont returns the most recently written user font name.
func newestInstalledFont(dir string) (string, bool) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", false
	}
	newest := ""
	var newestTime int64
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".gob") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if stamp := info.ModTime().UnixNano(); stamp > newestTime {
			newestTime = stamp
			newest = strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		}
	}
	return newest, newest != ""
}

// ensureCJKWatermarkFont installs a system CJK TrueType font into a dedicated
// pdfcpu font directory and returns the name it was registered under.
func ensureCJKWatermarkFont() (string, error) {
	cjkWatermarkFont.once.Do(func() {
		// Creating a default config initializes pdfcpu's global settings.
		model.NewDefaultConfiguration()
		cache, err := os.UserCacheDir()
		if err != nil {
			cjkWatermarkFont.err = fmt.Errorf("无法定位用户缓存目录：%w", err)
			return
		}
		dir := filepath.Join(cache, "LocalToolbox", "pdf-fonts")
		if err := os.MkdirAll(dir, 0700); err != nil {
			cjkWatermarkFont.err = fmt.Errorf("无法创建字体目录：%w", err)
			return
		}
		font.UserFontDir = dir
		// A font installed by an earlier run is already available.
		if name, ok := newestInstalledFont(dir); ok {
			if err := font.LoadUserFonts(); err == nil && font.IsUserFont(name) {
				cjkWatermarkFont.name = name
				return
			}
		}
		windowsDir := os.Getenv("WINDIR")
		if windowsDir == "" {
			windowsDir = `C:\Windows`
		}
		var attempts []string
		for _, candidate := range cjkFontCandidates {
			path := filepath.Join(windowsDir, "Fonts", candidate)
			data, err := os.ReadFile(path)
			if err != nil {
				attempts = append(attempts, candidate+": 无法读取")
				continue
			}
			if err := font.InstallFontFromBytes(dir, cjkWatermarkFontName, data); err != nil {
				attempts = append(attempts, candidate+": "+err.Error())
				continue
			}
			if err := font.LoadUserFonts(); err != nil {
				attempts = append(attempts, candidate+": 加载失败 "+err.Error())
				continue
			}
			if name, ok := newestInstalledFont(dir); ok && font.IsUserFont(name) {
				cjkWatermarkFont.name = name
				return
			}
			attempts = append(attempts, candidate+": 安装后未注册")
		}
		cjkWatermarkFont.err = fmt.Errorf("未找到可用的中文字体（%s），请改用英文水印或安装黑体、等线字体", strings.Join(attempts, "；"))
	})
	return cjkWatermarkFont.name, cjkWatermarkFont.err
}

// PDFWatermarkService stores one selected PDF for watermarking.
type PDFWatermarkService struct {
	mu         sync.Mutex
	source     string
	lastOutput string
	busy       bool
}

// NewPDFWatermarkService creates the native PDF watermark service.
func NewPDFWatermarkService() *PDFWatermarkService { return &PDFWatermarkService{} }

// ChoosePDF selects one PDF for watermarking.
func (s *PDFWatermarkService) ChoosePDF() (PDFSource, error) {
	app := application.Get()
	if app == nil {
		return PDFSource{}, errors.New("桌面窗口尚未就绪")
	}
	s.mu.Lock()
	busy := s.busy
	s.mu.Unlock()
	if busy {
		return PDFSource{}, errors.New("正在处理 PDF")
	}
	path, err := app.Dialog.OpenFile().SetTitle("选择 PDF 文件").AddFilter("PDF 文件", "*.pdf").PromptForSingleSelection()
	if err != nil || path == "" {
		return PDFSource{}, err
	}
	if !strings.EqualFold(filepath.Ext(path), ".pdf") {
		return PDFSource{}, errors.New("只能选择 PDF 文件")
	}
	info, err := os.Stat(path)
	if err != nil {
		return PDFSource{}, err
	}
	if info.IsDir() {
		return PDFSource{}, errors.New("请选择 PDF 文件")
	}
	pages, err := api.PageCountFile(path)
	if err != nil {
		return PDFSource{}, fmt.Errorf("无法读取 %s：%w", info.Name(), err)
	}
	s.mu.Lock()
	s.source = path
	s.lastOutput = ""
	s.mu.Unlock()
	return PDFSource{Name: info.Name(), Pages: pages, Bytes: info.Size()}, nil
}

// validateWatermarkOptions checks every value coming from the interface.
func validateWatermarkOptions(text string, fontSize, opacityPercent, rotation int, color string) error {
	if strings.TrimSpace(text) == "" {
		return errors.New("请输入水印文字")
	}
	if utf8.RuneCountInString(text) > 100 {
		return errors.New("水印文字最多 100 个字符")
	}
	if fontSize < 8 || fontSize > 200 {
		return errors.New("字号需在 8–200 之间")
	}
	if opacityPercent < 5 || opacityPercent > 100 {
		return errors.New("不透明度需在 5–100% 之间")
	}
	if rotation < -180 || rotation > 180 {
		return errors.New("旋转角度需在 -180–180 之间")
	}
	if !watermarkColorPattern.MatchString(color) {
		return errors.New("水印颜色格式无效")
	}
	return nil
}

// buildWatermarkDesc composes the pdfcpu watermark description string.
func buildWatermarkDesc(fontName string, fontSize, opacityPercent, rotation int, color string) string {
	return fmt.Sprintf(
		"fontname:%s, points:%d, position:c, opacity:%.2f, rotation:%d, fillcolor:%s, rendermode:0",
		fontName, fontSize, float64(opacityPercent)/100, rotation, color,
	)
}

// AddWatermark draws the text across every page of a copy of the PDF.
func (s *PDFWatermarkService) AddWatermark(text string, fontSize, opacityPercent, rotation int, color string, onTop bool) (PDFManageResult, error) {
	text = strings.TrimSpace(text)
	if err := validateWatermarkOptions(text, fontSize, opacityPercent, rotation, color); err != nil {
		return PDFManageResult{}, err
	}
	s.mu.Lock()
	if s.busy {
		s.mu.Unlock()
		return PDFManageResult{}, errors.New("正在处理 PDF")
	}
	if s.source == "" {
		s.mu.Unlock()
		return PDFManageResult{}, errors.New("请先选择 PDF 文件")
	}
	source := s.source
	s.busy = true
	s.mu.Unlock()
	output := ""
	defer func() {
		s.mu.Lock()
		s.busy = false
		s.mu.Unlock()
		if output != "" {
			s.mu.Lock()
			s.lastOutput = filepath.Dir(output)
			s.mu.Unlock()
		}
	}()
	if _, err := os.Stat(source); err != nil {
		return PDFManageResult{}, err
	}
	pages, err := api.PageCountFile(source)
	if err != nil {
		return PDFManageResult{}, err
	}
	fontName := "Helvetica"
	if containsCJK(text) {
		cjkName, err := ensureCJKWatermarkFont()
		if err != nil {
			return PDFManageResult{}, err
		}
		fontName = cjkName
	}
	wm, err := pdfcpu.ParseTextWatermarkDetails(text, buildWatermarkDesc(fontName, fontSize, opacityPercent, rotation, color), onTop, types.POINTS)
	if err != nil {
		return PDFManageResult{}, fmt.Errorf("水印参数无效：%w", err)
	}
	path, err := sameSourceOutput(source, "_水印", ".pdf")
	if err != nil {
		return PDFManageResult{}, err
	}
	conf := model.NewDefaultConfiguration()
	if err := api.AddWatermarksFile(source, path, nil, wm, conf); err != nil {
		return PDFManageResult{}, fmt.Errorf("添加水印失败：%w", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return PDFManageResult{}, err
	}
	output = path
	return PDFManageResult{Location: path, Count: pages, Bytes: info.Size()}, nil
}

// OpenPDFWatermarkOutputFolder reveals the latest watermarked PDF.
func (s *PDFWatermarkService) OpenPDFWatermarkOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已生成的水印 PDF")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(path, false)
}
