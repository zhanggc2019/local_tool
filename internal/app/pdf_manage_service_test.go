package app

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

// TestPDFManageOperations verifies that the bundled PDF engine writes readable results.
func TestPDFManageOperations(t *testing.T) {
	source := filepath.Join("..", "..", "testdata", "sample-2pages.pdf")
	dir := t.TempDir()
	merged := filepath.Join(dir, "merged.pdf")
	if err := api.MergeCreateFile([]string{source, source}, merged, false, nil); err != nil {
		t.Fatalf("merge: %v", err)
	}
	pages, err := api.PageCountFile(merged)
	if err != nil || pages != 4 {
		t.Fatalf("merged page count = %d, %v; want 4", pages, err)
	}
	splitDir := filepath.Join(dir, "split")
	if err := os.Mkdir(splitDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := api.SplitFile(merged, splitDir, 2, nil); err != nil {
		t.Fatalf("split: %v", err)
	}
	entries, err := os.ReadDir(splitDir)
	if err != nil || len(entries) != 2 {
		t.Fatalf("split files = %d, %v; want 2", len(entries), err)
	}
	for _, entry := range entries {
		count, countErr := api.PageCountFile(filepath.Join(splitDir, entry.Name()))
		if countErr != nil || count != 2 {
			t.Fatalf("split page count = %d, %v; want 2", count, countErr)
		}
	}
	optimized := filepath.Join(dir, "optimized.pdf")
	if err := api.OptimizeFile(merged, optimized, nil); err != nil {
		t.Fatalf("optimize: %v", err)
	}
	pages, err = api.PageCountFile(optimized)
	if err != nil || pages != 4 {
		t.Fatalf("optimized page count = %d, %v; want 4", pages, err)
	}
}
