package socket

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestWarpProbeVerifiesTraceInsteadOfJustOpenProxy(t *testing.T) {
	for _, item := range []struct {
		name, body, reason string
		status             int
		ok                 bool
	}{
		{"healthy", "warp=on\nip=192.0.2.1\nloc=US\ncolo=LAX\n", "", 200, true},
		{"plus", "warp=plus\nip=2001:db8::1\nloc=US\n", "", 200, true},
		{"direct", "warp=off\nip=192.0.2.1\n", "not_warp", 200, false},
		{"html", "<html>not a trace</html>", "not_warp", 200, false},
		{"bad-ip", "warp=on\nip=not-an-ip\n", "unexpected_response", 200, false},
		{"failure", "warp=on\nip=192.0.2.1\n", "unexpected_response", 503, false},
	} {
		t.Run(item.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(item.status); io.WriteString(w, item.body) }))
			defer server.Close()
			result := probeWarp(context.Background(), server.Client(), server.URL)
			if result["ok"] != item.ok {
				t.Fatalf("wrong probe result: %v", result)
			}
			if !item.ok && result["reason"] != item.reason {
				t.Fatal(result)
			}
		})
	}
}
func TestWarpProbeConnectionFailuresAndValidation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if result := probeWarp(ctx, &http.Client{Timeout: time.Second}, "https://127.0.0.1:1"); result["ok"] != false {
		t.Fatal(result)
	}
	reporter := &WebSocketReporter{}
	for _, request := range []interface{}{nil, map[string]interface{}{"port": 0}, map[string]interface{}{"port": 65536}, map[string]interface{}{"port": 3.5}, map[string]interface{}{"port": "31000"}} {
		if _, err := reporter.handleTestWarp(request); err == nil {
			t.Fatal("accepted invalid WARP port")
		}
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	result, err := reporter.handleTestWarp(map[string]interface{}{"port": port})
	if err != nil || result["ok"] != false || result["reason"] != "unreachable" {
		t.Fatalf("missing proxy incorrectly accepted: %v %v", result, err)
	}
}
