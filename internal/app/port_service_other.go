//go:build !windows

package app

import "errors"

// QueryPort reports that this utility is only available on Windows.
func (s *PortService) QueryPort(port int) ([]PortOwner, error) {
	return nil, errors.New("端口占用工具仅支持 Windows")
}

// KillPortProcess reports that process termination is only available on Windows.
func (s *PortService) KillPortProcess(port, pid int, started string) error {
	return errors.New("端口占用工具仅支持 Windows")
}
