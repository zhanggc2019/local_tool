//go:build windows

package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var isProcessCritical = windows.NewLazySystemDLL("kernel32.dll").NewProc("IsProcessCritical")

// netstatOwners reads numeric local endpoints from the Windows system executable.
func netstatOwners(port int) (map[int][]PortEndpoint, error) {
	if err := validatePort(port); err != nil {
		return nil, err
	}
	directory, err := windows.GetSystemDirectory()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, filepath.Join(directory, "netstat.exe"), "-a", "-n", "-o", "-q")
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	output, err := command.Output()
	if err != nil {
		if ctx.Err() != nil {
			return nil, errors.New("查询端口超时")
		}
		return nil, fmt.Errorf("查询端口失败：%w", err)
	}
	return parseNetstat(string(output), port), nil
}

// processDetails reads the executable path and exact creation token from a handle.
func processDetails(handle windows.Handle) (string, string, error) {
	buffer := make([]uint16, 32768)
	length := uint32(len(buffer))
	if err := windows.QueryFullProcessImageName(handle, 0, &buffer[0], &length); err != nil {
		return "", "", err
	}
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
		return "", "", err
	}
	return windows.UTF16ToString(buffer[:length]), fmt.Sprintf("%08x%08x", created.HighDateTime, created.LowDateTime), nil
}

// criticalProcess checks the Windows critical-process flag before termination.
func criticalProcess(handle windows.Handle) (bool, error) {
	var critical int32
	result, _, callErr := isProcessCritical.Call(uintptr(handle), uintptr(unsafe.Pointer(&critical)))
	if result == 0 {
		if callErr != nil && callErr != syscall.Errno(0) {
			return false, callErr
		}
		return false, errors.New("无法核对系统关键进程状态")
	}
	return critical != 0, nil
}

// describeOwner reads one process without requesting termination permission.
func describeOwner(pid int, endpoints []PortEndpoint) PortOwner {
	owner := PortOwner{PID: pid, Endpoints: endpoints, Name: "无法读取进程信息", Reason: "无法核对进程身份，可能需要管理员权限"}
	if pid <= 4 {
		owner.Name = "Windows 系统进程"
		owner.Reason = "系统进程不能在此结束"
		return owner
	}
	if pid == os.Getpid() {
		owner.Name = "本地工具箱"
		owner.Reason = "不能结束当前工具箱"
		return owner
	}
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return owner
	}
	defer windows.CloseHandle(handle)
	path, started, err := processDetails(handle)
	if err != nil {
		return owner
	}
	owner.Name, owner.Path, owner.Started = filepath.Base(path), path, started
	critical, err := criticalProcess(handle)
	if err != nil {
		owner.Reason = "无法核对系统关键进程状态"
	} else if critical {
		owner.Reason = "Windows 关键进程不能在此结束"
	} else {
		owner.CanTerminate = true
		owner.Reason = ""
	}
	return owner
}

// QueryPort returns current process owners for a local TCP or UDP port.
func (s *PortService) QueryPort(port int) ([]PortOwner, error) {
	bindings, err := netstatOwners(port)
	if err != nil {
		return nil, err
	}
	pids := make([]int, 0, len(bindings))
	for pid := range bindings {
		pids = append(pids, pid)
	}
	sort.Ints(pids)
	owners := make([]PortOwner, 0, len(pids))
	for _, pid := range pids {
		owners = append(owners, describeOwner(pid, bindings[pid]))
	}
	return owners, nil
}

// KillPortProcess rechecks the port and process identity before termination.
func (s *PortService) KillPortProcess(port, pid int, started string) error {
	if err := validatePort(port); err != nil {
		return err
	}
	if pid <= 4 || pid == os.Getpid() || strings.TrimSpace(started) == "" {
		return errors.New("该进程不能在此结束")
	}
	bindings, err := netstatOwners(port)
	if err != nil {
		return err
	}
	if len(bindings[pid]) == 0 {
		return errors.New("该进程已不再占用此端口，请重新查询")
	}
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION|windows.PROCESS_TERMINATE|windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return fmt.Errorf("无法打开进程，可能需要管理员权限：%w", err)
	}
	defer windows.CloseHandle(handle)
	_, actualStarted, err := processDetails(handle)
	if err != nil || actualStarted != started {
		return errors.New("进程身份已变化，请重新查询")
	}
	critical, err := criticalProcess(handle)
	if err != nil || critical {
		return errors.New("无法核对或不允许结束 Windows 关键进程")
	}
	bindings, err = netstatOwners(port)
	if err != nil {
		return err
	}
	if len(bindings[pid]) == 0 {
		return errors.New("该进程已不再占用此端口，请重新查询")
	}
	if err := windows.TerminateProcess(handle, 1); err != nil {
		return fmt.Errorf("结束进程失败：%w", err)
	}
	event, err := windows.WaitForSingleObject(handle, 3000)
	if err != nil {
		return fmt.Errorf("已发送结束请求，但无法确认进程已退出：%w", err)
	}
	if event != windows.WAIT_OBJECT_0 {
		return errors.New("已发送结束请求，但进程尚未退出")
	}
	return nil
}
