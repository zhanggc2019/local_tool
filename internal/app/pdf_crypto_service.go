package app

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// PDFCryptoService stores one selected PDF for encryption or decryption.
type PDFCryptoService struct {
	mu         sync.Mutex
	source     string
	pages      int
	lastOutput string
	busy       bool
}

// NewPDFCryptoService creates the native PDF password service.
func NewPDFCryptoService() *PDFCryptoService { return &PDFCryptoService{} }

// fileMentionsEncrypt checks the PDF trailer for an /Encrypt entry.
func fileMentionsEncrypt(path string) bool {
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return false
	}
	const window = 64 * 1024
	offset := info.Size() - window
	if offset < 0 {
		offset = 0
	}
	if _, err := file.Seek(offset, io.SeekStart); err != nil {
		return false
	}
	data := make([]byte, info.Size()-offset)
	if _, err := io.ReadFull(file, data); err != nil {
		return false
	}
	return bytes.Contains(data, []byte("/Encrypt"))
}

// ChoosePDF selects one PDF; encrypted files are reported without a page count.
func (s *PDFCryptoService) ChoosePDF() (PDFSource, error) {
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
	pages, countErr := api.PageCountFile(path)
	encrypted := false
	if countErr != nil {
		if !fileMentionsEncrypt(path) {
			return PDFSource{}, fmt.Errorf("无法读取 %s：%w", info.Name(), countErr)
		}
		encrypted = true
		pages = 0
	}
	s.mu.Lock()
	s.source = path
	s.pages = pages
	s.lastOutput = ""
	s.mu.Unlock()
	return PDFSource{Name: info.Name(), Pages: pages, Bytes: info.Size(), Encrypted: encrypted}, nil
}

// validatePDFPassword bounds the accepted password length.
func validatePDFPassword(password string) error {
	if utf8.RuneCountInString(password) < 4 {
		return errors.New("密码至少需要 4 个字符")
	}
	if utf8.RuneCountInString(password) > 64 {
		return errors.New("密码最多 64 个字符")
	}
	return nil
}

// buildEncryptPermissions keeps only the permissions the user allowed.
func buildEncryptPermissions(allowPrint, allowCopy bool) model.PermissionFlags {
	permissions := model.PermissionsAll
	if !allowPrint {
		permissions &^= model.PermissionPrintRev2 | model.PermissionPrintRev3
	}
	if !allowCopy {
		permissions &^= model.PermissionExtract | model.PermissionExtractRev3
	}
	return permissions
}

// beginCryptoOperation locks the selected PDF.
func (s *PDFCryptoService) beginCryptoOperation() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.busy {
		return "", errors.New("正在处理 PDF")
	}
	if s.source == "" {
		return "", errors.New("请先选择 PDF 文件")
	}
	if _, err := os.Stat(s.source); err != nil {
		return "", err
	}
	s.busy = true
	return s.source, nil
}

// finishCryptoOperation releases the lock and remembers the output folder.
func (s *PDFCryptoService) finishCryptoOperation(location string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.busy = false
	if location != "" {
		s.lastOutput = filepath.Dir(location)
	}
}

// EncryptPDF saves an AES-256 encrypted copy with the requested permissions.
func (s *PDFCryptoService) EncryptPDF(userPassword, ownerPassword string, allowPrint, allowCopy bool) (PDFManageResult, error) {
	if err := validatePDFPassword(userPassword); err != nil {
		return PDFManageResult{}, err
	}
	if ownerPassword == "" {
		ownerPassword = userPassword
	}
	if err := validatePDFPassword(ownerPassword); err != nil {
		return PDFManageResult{}, fmt.Errorf("所有者密码：%w", err)
	}
	source, err := s.beginCryptoOperation()
	if err != nil {
		return PDFManageResult{}, err
	}
	output := ""
	defer func() { s.finishCryptoOperation(output) }()
	if fileMentionsEncrypt(source) {
		return PDFManageResult{}, errors.New("该 PDF 已加密，请先解密后再重新加密")
	}
	pages, err := api.PageCountFile(source)
	if err != nil {
		return PDFManageResult{}, err
	}
	path, err := sameSourceOutput(source, "_加密", ".pdf")
	if err != nil {
		return PDFManageResult{}, err
	}
	conf := model.NewDefaultConfiguration()
	conf.UserPW = userPassword
	conf.OwnerPW = ownerPassword
	conf.EncryptUsingAES = true
	conf.EncryptKeyLength = 256
	conf.Permissions = buildEncryptPermissions(allowPrint, allowCopy)
	if err := api.EncryptFile(source, path, conf); err != nil {
		return PDFManageResult{}, fmt.Errorf("加密失败：%w", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return PDFManageResult{}, err
	}
	output = path
	return PDFManageResult{Location: path, Count: pages, Bytes: info.Size()}, nil
}

// DecryptPDF saves an unlocked copy using the supplied password.
func (s *PDFCryptoService) DecryptPDF(password string) (PDFManageResult, error) {
	if password == "" {
		return PDFManageResult{}, errors.New("请输入 PDF 密码")
	}
	if utf8.RuneCountInString(password) > 64 {
		return PDFManageResult{}, errors.New("密码最多 64 个字符")
	}
	source, err := s.beginCryptoOperation()
	if err != nil {
		return PDFManageResult{}, err
	}
	output := ""
	defer func() { s.finishCryptoOperation(output) }()
	if !fileMentionsEncrypt(source) {
		return PDFManageResult{}, errors.New("该 PDF 没有加密，无需解密")
	}
	path, err := sameSourceOutput(source, "_解密", ".pdf")
	if err != nil {
		return PDFManageResult{}, err
	}
	conf := model.NewDefaultConfiguration()
	conf.UserPW = password
	conf.OwnerPW = password
	if err := api.DecryptFile(source, path, conf); err != nil {
		return PDFManageResult{}, fmt.Errorf("解密失败，密码可能不正确：%w", err)
	}
	pages, err := api.PageCountFile(path)
	if err != nil {
		_ = os.Remove(path)
		return PDFManageResult{}, fmt.Errorf("解密结果无法读取：%w", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return PDFManageResult{}, err
	}
	output = path
	return PDFManageResult{Location: path, Count: pages, Bytes: info.Size()}, nil
}

// OpenPDFCryptoOutputFolder reveals the latest result in the file manager.
func (s *PDFCryptoService) OpenPDFCryptoOutputFolder() error {
	s.mu.Lock()
	path := s.lastOutput
	s.mu.Unlock()
	if path == "" {
		return errors.New("还没有已完成的加密或解密")
	}
	app := application.Get()
	if app == nil {
		return errors.New("桌面窗口尚未就绪")
	}
	return app.Env.OpenFileManager(path, false)
}
