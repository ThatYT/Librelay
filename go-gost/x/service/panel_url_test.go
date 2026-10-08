package service

import (
	"net/url"
	"testing"
)

func TestReportEndpointsPreserveTLS(t *testing.T) {
	for _, addr := range []string{"https://example.com:2095", "http://example.com:2095", "example.com:6365"} {
		SetHTTPReportURL(addr, "0123456789abcdef0123456789abcdef")
		for _, tc := range []struct{ raw, path string }{{httpReportURL, "/flow/upload"}, {configReportURL, "/flow/config"}} {
			u, err := url.Parse(tc.raw)
			if err != nil {
				t.Fatal(err)
			}
			want := "http"
			if addr == "https://example.com:2095" {
				want = "https"
			}
			if u.Scheme != want || u.Path != tc.path || u.Query().Get("secret") != "0123456789abcdef0123456789abcdef" {
				t.Fatalf("incorrect endpoint %s", tc.raw)
			}
		}
	}
}
