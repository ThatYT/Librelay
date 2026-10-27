package socket

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/proxy"
)

type warpProbeRequest struct {
	Port int `json:"port"`
}

// Read-only: fixed loopback proxy and HTTPS destination; never installs or connects WARP.
func (w *WebSocketReporter) handleTestWarp(data interface{}) (map[string]interface{}, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("invalid WARP test request")
	}
	var request warpProbeRequest
	if err := json.Unmarshal(raw, &request); err != nil || request.Port < 1 || request.Port > 65535 {
		return nil, fmt.Errorf("WARP proxy port must be an integer between 1 and 65535")
	}
	dialer, err := proxy.SOCKS5("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(request.Port)), nil, &net.Dialer{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("cannot create WARP proxy test")
	}
	transport := &http.Transport{DialContext: dialer.(proxy.ContextDialer).DialContext, TLSHandshakeTimeout: 3 * time.Second}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 7 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}
	ctx, cancel := context.WithTimeout(context.Background(), 7*time.Second)
	defer cancel()
	return probeWarp(ctx, client, "https://www.cloudflare.com/cdn-cgi/trace"), nil
}

func probeWarp(ctx context.Context, client *http.Client, endpoint string) map[string]interface{} {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return map[string]interface{}{"ok": false, "reason": "unreachable"}
	}
	response, err := client.Do(request)
	if err != nil {
		return map[string]interface{}{"ok": false, "reason": "unreachable"}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return map[string]interface{}{"ok": false, "reason": "unexpected_response"}
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 8193))
	if err != nil || len(raw) > 8192 {
		return map[string]interface{}{"ok": false, "reason": "unexpected_response"}
	}
	fields := map[string]string{}
	for _, line := range strings.Split(string(raw), "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), "=")
		if found {
			fields[key] = value
		}
	}
	if fields["warp"] != "on" && fields["warp"] != "plus" {
		return map[string]interface{}{"ok": false, "reason": "not_warp"}
	}
	if net.ParseIP(fields["ip"]) == nil {
		return map[string]interface{}{"ok": false, "reason": "unexpected_response"}
	}
	return map[string]interface{}{"ok": true, "warp": fields["warp"], "exitIp": fields["ip"], "country": fields["loc"], "colo": fields["colo"]}
}
