//go:build !windows

package app

import "os/exec"

// hideAudioCommand leaves command presentation to the current platform.
func hideAudioCommand(_ *exec.Cmd) {}
