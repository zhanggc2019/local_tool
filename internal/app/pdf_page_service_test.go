package app

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// pageRotation reads the /Rotate entry of one page in a saved PDF.
func pageRotation(t *testing.T, path string, pageNr int) int {
	t.Helper()
	ctx, err := api.ReadContextFile(path)
	if err != nil {
		t.Fatal(err)
	}
	dict, _, _, err := ctx.PageDict(pageNr, false)
	if err != nil {
		t.Fatal(err)
	}
	value, ok := dict["Rotate"]
	if !ok {
		return 0
	}
	switch typed := value.(type) {
	case types.Integer:
		return int(typed)
	case types.Float:
		return int(typed)
	case types.Name:
		number, _ := strconv.Atoi(string(typed))
		return number
	}
	t.Fatalf("无法解析 /Rotate 值：%T", value)
	return 0
}

// copySamplePDF stores the two-page fixture in a temp directory.
func copySamplePDF(t *testing.T) string {
	t.Helper()
	fixture, err := os.ReadFile(filepath.Join("..", "..", "testdata", "sample-2pages.pdf"))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "sample-2pages.pdf")
	if err := os.WriteFile(path, fixture, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

// newPDFPageService prepares a service bound to a copied sample PDF.
func newPDFPageService(t *testing.T) (*PDFPageService, string) {
	t.Helper()
	source := copySamplePDF(t)
	pages, err := api.PageCountFile(source)
	if err != nil {
		t.Fatal(err)
	}
	service := NewPDFPageService()
	service.source = source
	service.pages = pages
	return service, source
}

// TestParsePageSelection covers the selection grammar.
func TestParsePageSelection(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		count   int
		want    []int
		wantErr bool
	}{
		{"single", "3", 6, []int{3}, false},
		{"range", "1-3,5", 6, []int{1, 2, 3, 5}, false},
		{"open range", "3-", 6, []int{3, 4, 5, 6}, false},
		{"leading range", "-2", 6, []int{1, 2}, false},
		{"even words", "偶数页", 6, []int{2, 4, 6}, false},
		{"odd words", "奇数", 6, []int{1, 3, 5}, false},
		{"all", "全部", 4, []int{1, 2, 3, 4}, false},
		{"chinese comma", "1，3", 6, []int{1, 3}, false},
		{"dedupe and sort", "5,1,3-4,3", 6, []int{1, 3, 4, 5}, false},
		{"empty", "", 6, nil, true},
		{"zero", "0", 6, nil, true},
		{"too large", "7", 6, nil, true},
		{"reversed range", "5-3", 6, nil, true},
		{"garbage", "abc", 6, nil, true},
		{"range out of bounds", "4-9", 6, nil, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parsePageSelection(tc.input, tc.count)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %v", got)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("pages = %v, want %v", got, tc.want)
			}
			for index := range got {
				if got[index] != tc.want[index] {
					t.Fatalf("pages = %v, want %v", got, tc.want)
				}
			}
		})
	}
}

// TestRotatePages writes a rotated copy and leaves a rotate marker.
func TestRotatePages(t *testing.T) {
	service, _ := newPDFPageService(t)
	result, err := service.RotatePages(90, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 2 {
		t.Fatalf("rotated pages = %d, want 2", result.Count)
	}
	if !strings.HasSuffix(result.Location, "_旋转.pdf") {
		t.Fatalf("output name = %s", filepath.Base(result.Location))
	}
	if got := pageRotation(t, result.Location, 1); got != 90 {
		t.Fatalf("第 1 页旋转 = %d, want 90", got)
	}
	if got := pageRotation(t, result.Location, 2); got != 90 {
		t.Fatalf("第 2 页旋转 = %d, want 90", got)
	}
	pages, err := api.PageCountFile(result.Location)
	if err != nil || pages != 2 {
		t.Fatalf("page count = %d (err %v), want 2", pages, err)
	}
}

// TestRotatePagesSelection rotates only the requested page.
func TestRotatePagesSelection(t *testing.T) {
	service, _ := newPDFPageService(t)
	result, err := service.RotatePages(180, "1")
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 1 {
		t.Fatalf("rotated pages = %d, want 1", result.Count)
	}
	if got := pageRotation(t, result.Location, 1); got != 180 {
		t.Fatalf("第 1 页旋转 = %d, want 180", got)
	}
	if got := pageRotation(t, result.Location, 2); got != 0 {
		t.Fatalf("第 2 页旋转 = %d, want 0", got)
	}
}

// TestRotatePagesValidation rejects unsupported angles.
func TestRotatePagesValidation(t *testing.T) {
	service, _ := newPDFPageService(t)
	for _, angle := range []int{0, 45, 360, -90} {
		if _, err := service.RotatePages(angle, ""); err == nil || !strings.Contains(err.Error(), "旋转角度") {
			t.Fatalf("angle %d: expected error, got %v", angle, err)
		}
	}
}

// TestDeletePages removes selected pages.
func TestDeletePages(t *testing.T) {
	service, _ := newPDFPageService(t)
	result, err := service.DeletePages("1")
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 1 {
		t.Fatalf("remaining pages = %d, want 1", result.Count)
	}
	pages, err := api.PageCountFile(result.Location)
	if err != nil || pages != 1 {
		t.Fatalf("page count = %d (err %v), want 1", pages, err)
	}
}

// TestDeletePagesGuards refuses empty selections and full deletion.
func TestDeletePagesGuards(t *testing.T) {
	service, _ := newPDFPageService(t)
	if _, err := service.DeletePages(""); err == nil || !strings.Contains(err.Error(), "要删除的页码") {
		t.Fatalf("expected empty selection error, got %v", err)
	}
	if _, err := service.DeletePages("全部"); err == nil || !strings.Contains(err.Error(), "不能删除全部") {
		t.Fatalf("expected full deletion error, got %v", err)
	}
}

// TestExtractPages writes one PDF per selected page into a new folder.
func TestExtractPages(t *testing.T) {
	service, _ := newPDFPageService(t)
	result, err := service.ExtractPages("1-2")
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 2 {
		t.Fatalf("extracted = %d, want 2", result.Count)
	}
	if !strings.HasSuffix(filepath.Base(result.Location), "_提取页") {
		t.Fatalf("folder name = %s", filepath.Base(result.Location))
	}
	entries, err := os.ReadDir(result.Location)
	if err != nil || len(entries) != 2 {
		t.Fatalf("folder entries = %d (err %v), want 2", len(entries), err)
	}
	for _, entry := range entries {
		if !strings.HasSuffix(strings.ToLower(entry.Name()), ".pdf") {
			t.Fatalf("unexpected file %s", entry.Name())
		}
	}
}

// TestExtractPagesCollision checks the folder naming loop.
func TestExtractPagesCollision(t *testing.T) {
	service, source := newPDFPageService(t)
	first, err := service.ExtractPages("1")
	if err != nil {
		t.Fatal(err)
	}
	service.busy = false
	second, err := service.ExtractPages("2")
	if err != nil {
		t.Fatal(err)
	}
	if first.Location == second.Location {
		t.Fatalf("second extraction reused folder %s", second.Location)
	}
	if filepath.Base(second.Location) != strings.TrimSuffix(filepath.Base(source), ".pdf")+"_提取页_1" {
		t.Fatalf("folder name = %s", filepath.Base(second.Location))
	}
}

// TestPageOperationRequiresSelection rejects operations without a PDF.
func TestPageOperationRequiresSelection(t *testing.T) {
	service := NewPDFPageService()
	if _, err := service.RotatePages(90, ""); err == nil || !strings.Contains(err.Error(), "先选择 PDF") {
		t.Fatalf("expected selection error, got %v", err)
	}
}

// TestPageChooseWithoutWindow verifies the desktop dialog guard.
func TestPageChooseWithoutWindow(t *testing.T) {
	if _, err := NewPDFPageService().ChoosePDF(); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}
