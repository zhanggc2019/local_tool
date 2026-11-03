package main

import (
	"bufio"
	"errors"
	"sort"
	"strconv"
	"strings"
)

// PortEndpoint describes one local TCP or UDP binding.
type PortEndpoint struct {
	Protocol string `json:"protocol"`
	Local    string `json:"local"`
	State    string `json:"state"`
}

// PortOwner groups the bindings held by one Windows process.
type PortOwner struct {
	PID          int            `json:"pid"`
	Name         string         `json:"name"`
	Path         string         `json:"path"`
	Started      string         `json:"started"`
	CanTerminate bool           `json:"canTerminate"`
	Reason       string         `json:"reason"`
	Endpoints    []PortEndpoint `json:"endpoints"`
}

// PortService queries and terminates local Windows port owners.
type PortService struct{}

// NewPortService creates the port inspection service.
func NewPortService() *PortService { return &PortService{} }

// validatePort rejects values outside the TCP and UDP port range.
func validatePort(port int) error {
	if port < 1 || port > 65535 {
		return errors.New("端口号必须在 1 到 65535 之间")
	}
	return nil
}

// parseNetstat finds process IDs bound to the requested local port.
func parseNetstat(output string, port int) map[int][]PortEndpoint {
	owners := make(map[int][]PortEndpoint)
	seen := make(map[string]bool)
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 4 {
			continue
		}
		protocol := strings.ToUpper(fields[0])
		if protocol != "TCP" && protocol != "UDP" {
			continue
		}
		local := fields[1]
		separator := strings.LastIndexByte(local, ':')
		if separator < 0 {
			continue
		}
		localPort, err := strconv.Atoi(local[separator+1:])
		if err != nil || localPort != port {
			continue
		}
		pid, err := strconv.Atoi(fields[len(fields)-1])
		if err != nil || pid <= 0 {
			continue
		}
		state := ""
		if protocol == "TCP" && len(fields) >= 5 {
			state = fields[len(fields)-2]
			if strings.EqualFold(state, "TIME_WAIT") {
				continue
			}
		}
		key := strconv.Itoa(pid) + "|" + protocol + "|" + local + "|" + state
		if seen[key] {
			continue
		}
		seen[key] = true
		owners[pid] = append(owners[pid], PortEndpoint{Protocol: protocol, Local: local, State: state})
	}
	for pid := range owners {
		sort.Slice(owners[pid], func(i, j int) bool {
			left, right := owners[pid][i], owners[pid][j]
			return left.Protocol+left.Local+left.State < right.Protocol+right.Local+right.State
		})
	}
	return owners
}
