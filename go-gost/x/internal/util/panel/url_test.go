package panel

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"github.com/gorilla/websocket"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestEndpoint(t *testing.T) {
	for _, tc := range []struct{ addr, http, ws string }{
		{"node.example:6365", "http://node.example:6365", "ws://node.example:6365"},
		{"http://node.example:2095/", "http://node.example:2095", "ws://node.example:2095"},
		{"https://node.example:2095", "https://node.example:2095", "wss://node.example:2095"},
		{"https://[::1]:2095/base/", "https://[::1]:2095/base", "wss://[::1]:2095/base"},
	} {
		for _, ws := range []bool{false, true} {
			base := tc.http
			if ws {
				base = tc.ws
			}
			got, err := Endpoint(tc.addr, "/system-info", url.Values{"secret": {"a&b?c"}}, ws)
			if err != nil || got != base+"/system-info?secret=a%26b%3Fc" {
				t.Fatalf("%s: %s %v", tc.addr, got, err)
			}
		}
	}
}

func TestRejectUnsafeAddress(t *testing.T) {
	for _, addr := range []string{"", "ftp://example.com", "https://user:password@example.com", "https://example.com?secret=x", "https://example.com#fragment", "https://example.com:bad"} {
		if _, err := Normalize(addr); err == nil {
			t.Fatalf("accepted %q", addr)
		}
	}
}

func TestErrorDoesNotLeakQuery(t *testing.T) {
	cause := errors.New("connection refused")
	err := &url.Error{Op: "Post", URL: "https://example.com?secret=private", Err: cause}
	if SafeError(err).Error() != cause.Error() {
		t.Fatal("URL leaked")
	}
}

func TestTLSHTTPAndWebSocketWithVerifiedCertificate(t *testing.T) {
	upgrader := websocket.Upgrader{}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("secret") != "fixture&secret" {
			http.Error(w, "missing credential", 401)
			return
		}
		if r.URL.Path == "/system-info" {
			conn, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				return
			}
			defer conn.Close()
			_ = conn.WriteMessage(websocket.TextMessage, []byte("connected"))
			return
		}
		w.WriteHeader(200)
	}))
	defer server.Close()
	pool := x509.NewCertPool()
	pool.AddCert(server.Certificate())
	tlsConfig := &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: tlsConfig}}
	defer client.CloseIdleConnections()
	for _, path := range []string{"/flow/upload", "/flow/config"} {
		endpoint, err := Endpoint(server.URL, path, url.Values{"secret": {"fixture&secret"}}, false)
		if err != nil {
			t.Fatal(err)
		}
		response, err := client.Post(endpoint, "application/json", strings.NewReader("{}"))
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != 200 {
			t.Fatal(response.StatusCode)
		}
	}
	endpoint, _ := Endpoint(server.URL, "/system-info", url.Values{"secret": {"fixture&secret"}}, true)
	dialer := websocket.Dialer{TLSClientConfig: tlsConfig}
	conn, _, err := dialer.Dial(endpoint, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, message, err := conn.ReadMessage()
	if err != nil || string(message) != "connected" {
		t.Fatalf("%s %v", message, err)
	}
}
