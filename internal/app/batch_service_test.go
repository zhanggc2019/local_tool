package app

import (
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

// TestReadFileChunk reads large inputs in bounded chunks and rejects bad offsets.
func TestReadFileChunk(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "large.pdf")
	content := bytes.Repeat([]byte("abc"), 800000)
	if err := os.WriteFile(path, content, 0600); err != nil {
		t.Fatal(err)
	}
	service := &SourceFileService{files: map[string][]string{"pdf-image": {path}}}
	first, err := service.ReadFileChunk("pdf-image", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := base64.StdEncoding.DecodeString(first)
	if err != nil || !bytes.Equal(decoded, content[:2*1024*1024]) {
		t.Fatalf("first chunk invalid: %v", err)
	}
	last, err := service.ReadFileChunk("pdf-image", 0, 2*1024*1024)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err = base64.StdEncoding.DecodeString(last)
	if err != nil || !bytes.Equal(decoded, content[2*1024*1024:]) {
		t.Fatalf("last chunk invalid: %v", err)
	}
	if _, err := service.ReadFileChunk("pdf-image", 0, int64(len(content))); err == nil {
		t.Fatal("out-of-range offset accepted")
	}
}

// TestSameSourceOutput keeps outputs beside their sources and avoids collisions.
func TestSameSourceOutput(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "portrait.jpg")
	if err := os.WriteFile(source, []byte("source"), 0600); err != nil {
		t.Fatal(err)
	}
	first, err := sameSourceOutput(source, "_证件照", ".jpg")
	if err != nil || first != filepath.Join(dir, "portrait_证件照.jpg") {
		t.Fatalf("first output = %q, %v", first, err)
	}
	if err := os.WriteFile(first, []byte("existing"), 0600); err != nil {
		t.Fatal(err)
	}
	second, err := sameSourceOutput(source, "_证件照", ".jpg")
	if err != nil || second != filepath.Join(dir, "portrait_证件照_1.jpg") {
		t.Fatalf("collision output = %q, %v", second, err)
	}
	data, err := os.ReadFile(source)
	if err != nil || string(data) != "source" {
		t.Fatalf("source changed: %q, %v", data, err)
	}
}

// TestBatchPDFManageOperations processes two inputs without touching their originals.
func TestBatchPDFManageOperations(t *testing.T) {
	dir := t.TempDir()
	sample, err := os.ReadFile(filepath.Join("..", "..", "testdata", "sample-2pages.pdf"))
	if err != nil {
		t.Fatal(err)
	}
	inputs := []string{filepath.Join(dir, "a.pdf"), filepath.Join(dir, "b.pdf")}
	for _, path := range inputs {
		if err := os.WriteFile(path, sample, 0600); err != nil {
			t.Fatal(err)
		}
	}
	merge := &PDFManageService{sources: inputs}
	merged, err := merge.MergePDFs([]int{1, 0})
	if err != nil || filepath.Dir(merged.Location) != dir {
		t.Fatalf("merge = %+v, %v", merged, err)
	}
	if pages, err := api.PageCountFile(merged.Location); err != nil || pages != 4 {
		t.Fatalf("merged pages = %d, %v", pages, err)
	}
	split := &PDFManageService{sources: inputs}
	result, err := split.SplitPDF(1)
	if err != nil || result.Count != 4 || filepath.Dir(result.Location) != dir {
		t.Fatalf("split = %+v, %v", result, err)
	}
	for _, stem := range []string{"a_拆分_", "b_拆分_"} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, entry := range entries {
			found = found || entry.IsDir() && strings.HasPrefix(entry.Name(), stem)
		}
		if !found {
			t.Fatalf("missing output folder for %s", stem)
		}
	}
	compress := &PDFManageService{sources: inputs}
	optimized, err := compress.CompressPDF()
	if err != nil || optimized.Count != 2 || filepath.Dir(optimized.Location) != dir {
		t.Fatalf("compress = %+v, %v", optimized, err)
	}
	for _, path := range inputs {
		data, err := os.ReadFile(path)
		if err != nil || string(data) != string(sample) {
			t.Fatalf("source changed: %s, %v", path, err)
		}
	}
	missing := filepath.Join(dir, "missing.pdf")
	partialSplit := &PDFManageService{sources: []string{inputs[0], missing}}
	if result, err := partialSplit.SplitPDF(1); err != nil || result.Count != 2 || len(result.Failed) != 1 {
		t.Fatalf("partial split = %+v, %v", result, err)
	}
	partialCompress := &PDFManageService{sources: []string{inputs[0], missing}}
	if result, err := partialCompress.CompressPDF(); err != nil || result.Count != 1 || len(result.Failed) != 1 {
		t.Fatalf("partial compress = %+v, %v", result, err)
	}
}
