package socket

import (
	"net/url"
	"testing"
)

func TestReporterURLPreservesTLSAndEscapesCredentials(t *testing.T) {
	for _, addr := range []string{"https://example.com:2095", "http://example.com:2095", "example.com:6365"} {
		raw, err := reporterURL(addr, "fixture&secret", "1.2+test", 1, 2, 3)
		if err != nil {
			t.Fatal(err)
		}
		u, _ := url.Parse(raw)
		want := "ws"
		if addr == "https://example.com:2095" {
			want = "wss"
		}
		if u.Scheme != want || u.Path != "/system-info" || u.Query().Get("secret") != "fixture&secret" || u.Query().Get("version") != "1.2+test" || u.Query().Get("socks") != "3" {
			t.Fatalf("incorrect URL %s", raw)
		}
	}
}
