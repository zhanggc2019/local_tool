package main

import "testing"

// TestParseNetstat matches only the requested local port across TCP and UDP.
func TestParseNetstat(t *testing.T) {
	output := `
  TCP    0.0.0.0:8080          0.0.0.0:0              LISTENING       1234
  TCP    [::]:8080             [::]:0                 LISTENING       1234
  TCP    [::]:8080             [::]:0                 LISTENING       1234
  UDP    127.0.0.1:8080        *:*                                    2345
  TCP    127.0.0.1:9000        192.0.2.1:8080        ESTABLISHED     3456
  TCP    127.0.0.1:8080        0.0.0.0:0              TIME_WAIT       0
`
	owners := parseNetstat(output, 8080)
	if len(owners) != 2 || len(owners[1234]) != 2 || len(owners[2345]) != 1 {
		t.Fatalf("unexpected port owners: %+v", owners)
	}
	if owners[2345][0].Protocol != "UDP" || owners[1234][0].Local == "127.0.0.1:9000" {
		t.Fatalf("wrong endpoint parsed: %+v", owners)
	}
}

// TestValidatePort rejects numbers outside the TCP and UDP range.
func TestValidatePort(t *testing.T) {
	for _, value := range []int{0, -1, 65536} {
		if validatePort(value) == nil {
			t.Fatalf("accepted invalid port %d", value)
		}
	}
	for _, value := range []int{1, 8080, 65535} {
		if err := validatePort(value); err != nil {
			t.Fatalf("rejected port %d: %v", value, err)
		}
	}
}
