//go:build windows

package app

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

// TestPortHelperProcess starts a disposable listener for the termination test.
func TestPortHelperProcess(t *testing.T) {
	path := os.Getenv("PORT_TOOL_TEST_HELPER_FILE")
	if path == "" {
		return
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	if err := os.WriteFile(path, []byte(strconv.Itoa(port)), 0600); err != nil {
		t.Fatal(err)
	}
	for {
		time.Sleep(time.Hour)
	}
}

// TestKillPortProcessEndsOnlyMatchingHelper verifies the complete guarded action.
func TestKillPortProcessEndsOnlyMatchingHelper(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "port.txt")
	command := exec.Command(os.Args[0], "-test.run=^TestPortHelperProcess$")
	command.Env = append(os.Environ(), "PORT_TOOL_TEST_HELPER_FILE="+marker)
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = command.Process.Kill()
		_ = command.Wait()
	}()
	var port int
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		data, err := os.ReadFile(marker)
		if err == nil {
			port, err = strconv.Atoi(string(data))
			if err != nil {
				t.Fatal(err)
			}
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if port == 0 {
		t.Fatal("helper did not open a port")
	}
	service := NewPortService()
	owners, err := service.QueryPort(port)
	if err != nil {
		t.Fatal(err)
	}
	for _, owner := range owners {
		if owner.PID != command.Process.Pid {
			continue
		}
		if !owner.CanTerminate || owner.Started == "" {
			t.Fatalf("helper process is unavailable: %+v", owner)
		}
		if err := service.KillPortProcess(port, owner.PID, "wrong-start"); err == nil {
			t.Fatal("mismatched process identity was accepted")
		}
		if err := service.KillPortProcess(port, owner.PID, owner.Started); err != nil {
			t.Fatal(err)
		}
		return
	}
	t.Fatal(fmt.Sprintf("helper PID %d not found: %+v", command.Process.Pid, owners))
}

// TestProcessDetails verifies the Windows identity and critical-process checks.
func TestProcessDetails(t *testing.T) {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(os.Getpid()))
	if err != nil {
		t.Fatal(err)
	}
	defer windows.CloseHandle(handle)
	path, started, err := processDetails(handle)
	if err != nil || path == "" || started == "" {
		t.Fatalf("process identity = %q, %q, %v", path, started, err)
	}
	critical, err := criticalProcess(handle)
	if err != nil || critical {
		t.Fatalf("own test process marked critical: %v, %v", critical, err)
	}
}

// TestQueryPortFindsOwnListener checks the live Windows lookup without ending a process.
func TestQueryPortFindsOwnListener(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	owners, err := NewPortService().QueryPort(port)
	if err != nil {
		t.Fatal(err)
	}
	for _, owner := range owners {
		if owner.PID == os.Getpid() {
			if owner.CanTerminate {
				t.Fatal("current app process was made terminable")
			}
			return
		}
	}
	t.Fatalf("listener PID %d not found on port %d: %+v", os.Getpid(), port, owners)
}

// TestKillPortProcessRejectsSystemPID keeps the system PID guard ahead of termination.
func TestKillPortProcessRejectsSystemPID(t *testing.T) {
	if err := NewPortService().KillPortProcess(445, 4, "example"); err == nil {
		t.Fatal("system PID was accepted")
	}
}
