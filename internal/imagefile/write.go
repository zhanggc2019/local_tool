// Package imagefile contains file operations shared by image-based tools.
package imagefile

import (
	"fmt"
	"os"
	"path/filepath"
)

// WriteAtomic writes data through a temporary file in the destination directory.
func WriteAtomic(path string, data []byte) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".local-tools-*")
	if err != nil {
		return fmt.Errorf("无法创建临时文件: %w", err)
	}
	temp := file.Name()
	defer os.Remove(temp)
	if _, err = file.Write(data); err != nil {
		file.Close()
		return fmt.Errorf("写入文件失败: %w", err)
	}
	if err = file.Close(); err != nil {
		return fmt.Errorf("关闭文件失败: %w", err)
	}
	if err = os.Rename(temp, path); err != nil {
		return fmt.Errorf("保存文件失败: %w", err)
	}
	return nil
}
