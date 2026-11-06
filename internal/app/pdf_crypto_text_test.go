package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// newPDFCryptoService prepares a service bound to a copied sample PDF.
func newPDFCryptoService(t *testing.T) (*PDFCryptoService, string) {
	t.Helper()
	source := copySamplePDF(t)
	service := NewPDFCryptoService()
	service.source = source
	return service, source
}

// TestFileMentionsEncrypt distinguishes encrypted and plain PDFs.
func TestFileMentionsEncrypt(t *testing.T) {
	source := copySamplePDF(t)
	if fileMentionsEncrypt(source) {
		t.Fatal("未加密的样例被误判为加密")
	}
	service := NewPDFCryptoService()
	service.source = source
	if _, err := service.EncryptPDF("pass1234", "", true, true); err != nil {
		t.Fatal(err)
	}
	encrypted := filepath.Join(filepath.Dir(source), "sample-2pages_加密.pdf")
	if !fileMentionsEncrypt(encrypted) {
		t.Fatal("加密输出未被识别")
	}
}

// TestEncryptAndDecryptRoundTrip proves the password actually locks the file.
func TestEncryptAndDecryptRoundTrip(t *testing.T) {
	service, _ := newPDFCryptoService(t)
	result, err := service.EncryptPDF("pass1234", "owner5678", false, true)
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 2 {
		t.Fatalf("pages = %d, want 2", result.Count)
	}
	if !strings.HasSuffix(result.Location, "_加密.pdf") {
		t.Fatalf("output name = %s", filepath.Base(result.Location))
	}
	// Reading without the password must fail.
	if _, err := api.PageCountFile(result.Location); err == nil {
		t.Fatal("加密后的 PDF 未提供密码也能读取")
	}
	// Point the service at the encrypted file and decrypt it.
	service.source = result.Location
	decrypted, err := service.DecryptPDF("pass1234")
	if err != nil {
		t.Fatal(err)
	}
	if decrypted.Count != 2 {
		t.Fatalf("decrypted pages = %d, want 2", decrypted.Count)
	}
	pages, err := api.PageCountFile(decrypted.Location)
	if err != nil || pages != 2 {
		t.Fatalf("解密结果页数 = %d (err %v)", pages, err)
	}
	if fileMentionsEncrypt(decrypted.Location) {
		t.Fatal("解密结果仍包含 /Encrypt")
	}
}

// TestDecryptWrongPassword rejects an incorrect password.
func TestDecryptWrongPassword(t *testing.T) {
	service, _ := newPDFCryptoService(t)
	result, err := service.EncryptPDF("pass1234", "", true, true)
	if err != nil {
		t.Fatal(err)
	}
	service.source = result.Location
	if _, err := service.DecryptPDF("wrong-password"); err == nil || !strings.Contains(err.Error(), "解密失败") {
		t.Fatalf("expected wrong-password error, got %v", err)
	}
}

// TestPDFCryptoValidation covers passwords and operation guards.
func TestPDFCryptoValidation(t *testing.T) {
	service, _ := newPDFCryptoService(t)
	if _, err := service.EncryptPDF("abc", "", true, true); err == nil || !strings.Contains(err.Error(), "至少") {
		t.Fatalf("expected short password error, got %v", err)
	}
	if _, err := service.EncryptPDF("pass1234", "abc", true, true); err == nil || !strings.Contains(err.Error(), "所有者密码") {
		t.Fatalf("expected owner password error, got %v", err)
	}
	if _, err := service.DecryptPDF(""); err == nil || !strings.Contains(err.Error(), "请输入") {
		t.Fatalf("expected empty password error, got %v", err)
	}
	if _, err := service.DecryptPDF("pass1234"); err == nil || !strings.Contains(err.Error(), "没有加密") {
		t.Fatalf("expected not-encrypted error, got %v", err)
	}
	// Encrypting an already encrypted file is refused.
	result, err := service.EncryptPDF("pass1234", "", true, true)
	if err != nil {
		t.Fatal(err)
	}
	service.source = result.Location
	if _, err := service.EncryptPDF("pass1234", "", true, true); err == nil || !strings.Contains(err.Error(), "已加密") {
		t.Fatalf("expected already-encrypted error, got %v", err)
	}
}

// TestPDFCryptoRequiresSelection rejects operations before picking a file.
func TestPDFCryptoRequiresSelection(t *testing.T) {
	service := NewPDFCryptoService()
	if _, err := service.EncryptPDF("pass1234", "", true, true); err == nil || !strings.Contains(err.Error(), "先选择") {
		t.Fatalf("expected selection error, got %v", err)
	}
	if _, err := service.DecryptPDF("pass1234"); err == nil || !strings.Contains(err.Error(), "先选择") {
		t.Fatalf("expected selection error, got %v", err)
	}
}

// TestPDFCryptoPermissions checks the permission bit handling.
func TestPDFCryptoPermissions(t *testing.T) {
	all := buildEncryptPermissions(true, true)
	if all != model.PermissionsAll {
		t.Fatalf("allow-all permissions = %d", all)
	}
	none := buildEncryptPermissions(false, false)
	if none&(model.PermissionPrintRev2|model.PermissionPrintRev3) != 0 {
		t.Fatal("print permission not cleared")
	}
	if none&(model.PermissionExtract|model.PermissionExtractRev3) != 0 {
		t.Fatal("copy permission not cleared")
	}
	onlyPrint := buildEncryptPermissions(true, false)
	if onlyPrint&model.PermissionPrintRev3 == 0 {
		t.Fatal("print permission wrongly cleared")
	}
	if onlyPrint&model.PermissionExtract != 0 {
		t.Fatal("copy permission wrongly kept")
	}
}

// TestPDFCryptoChooseWithoutWindow verifies the desktop dialog guard.
func TestPDFCryptoChooseWithoutWindow(t *testing.T) {
	if _, err := NewPDFCryptoService().ChoosePDF(); err == nil || !strings.Contains(err.Error(), "桌面窗口尚未就绪") {
		t.Fatalf("expected window error, got %v", err)
	}
}

// TestTextOutputSave writes UTF-8 with BOM beside the PDF.
func TestTextOutputSave(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "doc.pdf")
	if err := os.WriteFile(source, []byte("%PDF-1.4"), 0600); err != nil {
		t.Fatal(err)
	}
	path, err := NewTextOutputService().SaveTextBesideSource(source, "pdf-text", "第一页文本\n第二页文本")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(path) != "doc_文本.txt" {
		t.Fatalf("output name = %s", filepath.Base(path))
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 3 || data[0] != 0xEF || data[1] != 0xBB || data[2] != 0xBF {
		t.Fatal("文本缺少 UTF-8 BOM")
	}
	if !strings.Contains(string(data[3:]), "第一页文本") {
		t.Fatal("文本内容不完整")
	}
}

// TestTextOutputValidation covers empty text and unknown kinds.
func TestTextOutputValidation(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "doc.pdf")
	if err := os.WriteFile(source, []byte("%PDF-1.4"), 0600); err != nil {
		t.Fatal(err)
	}
	service := NewTextOutputService()
	if _, err := service.SaveTextBesideSource(source, "other", "text"); err == nil || !strings.Contains(err.Error(), "未知") {
		t.Fatalf("expected kind error, got %v", err)
	}
	if _, err := service.SaveTextBesideSource(source, "pdf-text", "   \n "); err == nil || !strings.Contains(err.Error(), "没有") {
		t.Fatalf("expected empty text error, got %v", err)
	}
	if _, err := service.SaveTextBesideSource(filepath.Join(dir, "missing.pdf"), "pdf-text", "text"); err == nil {
		t.Fatal("expected source error")
	}
}

// TestTextOutputCollision checks the collision-free naming loop.
func TestTextOutputCollision(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "doc.pdf")
	if err := os.WriteFile(source, []byte("%PDF-1.4"), 0600); err != nil {
		t.Fatal(err)
	}
	service := NewTextOutputService()
	if _, err := service.SaveTextBesideSource(source, "pdf-text", "one"); err != nil {
		t.Fatal(err)
	}
	second, err := service.SaveTextBesideSource(source, "pdf-text", "two")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(second) != "doc_文本_1.txt" {
		t.Fatalf("second name = %s", filepath.Base(second))
	}
}
