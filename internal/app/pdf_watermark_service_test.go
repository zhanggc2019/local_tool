package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// newPDFWatermarkService prepares a service bound to a copied sample PDF.
func newPDFWatermarkService(t *testing.T) (*PDFWatermarkService, string) {
	t.Helper()
	source := copySamplePDF(t)
	service := NewPDFWatermarkService()
	service.source = source
	return service, source
}

// TestAddWatermark embeds the text and keeps the page count.
func TestAddWatermark(t *testing.T) {
	service, source := newPDFWatermarkService(t)
	result, err := service.AddWatermark("CONFIDENTIAL", 36, 30, 45, "#808080", false)
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 2 {
		t.Fatalf("pages = %d, want 2", result.Count)
	}
	if !strings.HasSuffix(result.Location, "_水印.pdf") {
		t.Fatalf("output name = %s", filepath.Base(result.Location))
	}
	pages, err := api.PageCountFile(result.Location)
	if err != nil || pages != 2 {
		t.Fatalf("page count = %d (err %v), want 2", pages, err)
	}
	outputInfo, err := os.Stat(result.Location)
	if err != nil {
		t.Fatal(err)
	}
	inputInfo, err := os.Stat(source)
	if err != nil {
		t.Fatal(err)
	}
	if outputInfo.Size() <= inputInfo.Size() {
		t.Fatalf("watermarked size %d not larger than source %d", outputInfo.Size(), inputInfo.Size())
	}
	// Extract the decompressed content streams and confirm the watermark text.
	contentDir := t.TempDir()
	if err := api.ExtractContentFile(result.Location, contentDir, nil, nil); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(contentDir)
	if err != nil || len(entries) == 0 {
		t.Fatalf("content extraction produced %d files (err %v)", len(entries), err)
	}
	// The watermark text is rendered inside a Form XObject; the page content
	// stream references it through a /Watermark artifact, which is what we verify.
	found := false
	for _, entry := range entries {
		data, readErr := os.ReadFile(filepath.Join(contentDir, entry.Name()))
		if readErr != nil {
			continue
		}
		content := string(data)
		if strings.Contains(content, "/Subtype /Watermark") && strings.Contains(content, "/Fm0 Do") {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("提取的页面内容中未找到水印 artifact")
	}
}

// TestAddWatermarkOnTop also verifies the stamp mode path.
func TestAddWatermarkOnTop(t *testing.T) {
	service, _ := newPDFWatermarkService(t)
	result, err := service.AddWatermark("DRAFT", 24, 50, -30, "#ff0000", true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(result.Location); err != nil {
		t.Fatal(err)
	}
}

// TestWatermarkValidation covers every option boundary.
func TestWatermarkValidation(t *testing.T) {
	cases := []struct {
		name      string
		text      string
		fontSize  int
		opacity   int
		rotation  int
		color     string
		wantPiece string
	}{
		{"empty text", "   ", 24, 30, 45, "#808080", "水印文字"},
		{"long text", strings.Repeat("水", 101), 24, 30, 45, "#808080", "最多 100"},
		{"small font", "X", 7, 30, 45, "#808080", "字号"},
		{"large font", "X", 201, 30, 45, "#808080", "字号"},
		{"low opacity", "X", 24, 4, 45, "#808080", "不透明度"},
		{"high opacity", "X", 24, 101, 45, "#808080", "不透明度"},
		{"bad rotation", "X", 24, 30, 181, "#808080", "旋转角度"},
		{"bad color", "X", 24, 30, 45, "red", "颜色"},
		{"short color", "X", 24, 30, 45, "#12345", "颜色"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := validateWatermarkOptions(tc.text, tc.fontSize, tc.opacity, tc.rotation, tc.color); err == nil || !strings.Contains(err.Error(), tc.wantPiece) {
				t.Fatalf("expected %q error, got %v", tc.wantPiece, err)
			}
		})
	}
	if err := validateWatermarkOptions("内部资料", 36, 30, 45, "#808080"); err != nil {
		t.Fatalf("valid options rejected: %v", err)
	}
}

// TestWatermarkDescComposition checks the pdfcpu description string.
func TestWatermarkDescComposition(t *testing.T) {
	desc := buildWatermarkDesc("Helvetica", 36, 30, 45, "#808080")
	for _, want := range []string{"fontname:Helvetica", "points:36", "position:c", "opacity:0.30", "rotation:45", "fillcolor:#808080"} {
		if !strings.Contains(desc, want) {
			t.Fatalf("desc missing %q: %s", want, desc)
		}
	}
}

// TestContainsCJK detects scripts that need a CJK font.
func TestContainsCJK(t *testing.T) {
	for _, text := range []string{"内部资料", "机密 2024", "コピー", "복사"} {
		if !containsCJK(text) {
			t.Fatalf("%q not detected as CJK", text)
		}
	}
	for _, text := range []string{"CONFIDENTIAL", "Draft 2024", ""} {
		if containsCJK(text) {
			t.Fatalf("%q wrongly detected as CJK", text)
		}
	}
}

// watermarkFormText decodes the first text-bearing Form XObject on page one.
func watermarkFormText(t *testing.T, path string) string {
	t.Helper()
	ctx, err := api.ReadContextFile(path)
	if err != nil {
		t.Fatal(err)
	}
	pageDict, _, _, err := ctx.PageDict(1, false)
	if err != nil {
		t.Fatal(err)
	}
	resources, err := ctx.DereferenceDict(pageDict["Resources"])
	if err != nil {
		t.Fatal(err)
	}
	xobjects, err := ctx.DereferenceDict(resources["XObject"])
	if err != nil {
		return ""
	}
	for _, value := range xobjects {
		stream, _, err := ctx.DereferenceStreamDict(value)
		if err != nil || stream == nil {
			continue
		}
		if err := stream.Decode(); err != nil {
			continue
		}
		content := string(stream.Content)
		if strings.Contains(content, "Tj") || strings.Contains(content, "TJ") {
			return content
		}
	}
	return ""
}

// fontDictHasType0 reports whether one resource dict references a CID font.
func fontDictHasType0(t *testing.T, ctx *model.Context, resources types.Dict) bool {
	t.Helper()
	fonts, err := ctx.DereferenceDict(resources["Font"])
	if err != nil {
		return false
	}
	for _, value := range fonts {
		dict, err := ctx.DereferenceDict(value)
		if err != nil {
			continue
		}
		if subtype, ok := dict["Subtype"].(types.Name); ok && string(subtype) == "Type0" {
			return true
		}
	}
	return false
}

// pageHasType0Font reports whether page one or its form XObjects use a CID font.
func pageHasType0Font(t *testing.T, path string) bool {
	t.Helper()
	ctx, err := api.ReadContextFile(path)
	if err != nil {
		t.Fatal(err)
	}
	pageDict, _, _, err := ctx.PageDict(1, false)
	if err != nil {
		t.Fatal(err)
	}
	resources, err := ctx.DereferenceDict(pageDict["Resources"])
	if err != nil {
		return false
	}
	if fontDictHasType0(t, ctx, resources) {
		return true
	}
	xobjects, err := ctx.DereferenceDict(resources["XObject"])
	if err != nil {
		return false
	}
	for _, value := range xobjects {
		stream, _, err := ctx.DereferenceStreamDict(value)
		if err != nil || stream == nil {
			continue
		}
		if formResources, err := ctx.DereferenceDict(stream.Dict["Resources"]); err == nil {
			if fontDictHasType0(t, ctx, formResources) {
				return true
			}
		}
	}
	return false
}

// TestAddChineseWatermark uses a system CJK font and verifies the rendering.
func TestAddChineseWatermark(t *testing.T) {
	if _, err := ensureCJKWatermarkFont(); err != nil {
		t.Skipf("当前系统缺少可用的中文字体，跳过：%v", err)
	}
	service, _ := newPDFWatermarkService(t)
	result, err := service.AddWatermark("内部资料", 36, 30, 45, "#808080", false)
	if err != nil {
		t.Fatal(err)
	}
	pages, err := api.PageCountFile(result.Location)
	if err != nil || pages != 2 {
		t.Fatalf("page count = %d (err %v), want 2", pages, err)
	}
	// The watermarked text must be drawn with an embedded CID font.
	if !pageHasType0Font(t, result.Location) {
		t.Fatal("页面资源中未找到 Type0 中文字体")
	}
	form := watermarkFormText(t, result.Location)
	if form == "" || !strings.Contains(form, "Tf") {
		t.Fatalf("水印 Form 内容缺少文字绘制指令：%q", form)
	}
}

// TestWatermarkRequiresSelection rejects watermarking without a PDF.
func TestWatermarkRequiresSelection(t *testing.T) {
	service := NewPDFWatermarkService()
	if _, err := service.AddWatermark("X", 24, 30, 45, "#808080", false); err == nil || !strings.Contains(err.Error(), "先选择 PDF") {
		t.Fatalf("expected selection error, got %v", err)
	}
}

// TestWatermarkChooseWithoutWindow verifies the desktop dialog guard.
func TestWatermarkChooseWithoutWindow(t *testing.T) {
	if _, err := NewPDFWatermarkService().ChoosePDF(); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}
