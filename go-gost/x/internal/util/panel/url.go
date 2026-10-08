// Package panel builds credential-safe HTTP and WebSocket panel endpoints.
package panel

import (
	"errors"
	"net/url"
	"strings"
)

// Normalize preserves explicit TLS and legacy scheme-less HTTP addresses.
func Normalize(addr string) (*url.URL, error) {
	addr = strings.TrimSpace(addr)
	if !strings.Contains(addr, "://") {
		addr = "http://" + addr
	}
	u, err := url.Parse(addr)
	if err != nil {
		return nil, errors.New("invalid panel address")
	}
	if (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("panel address must be an HTTP/HTTPS URL or host:port without credentials, query or fragment")
	}
	u.Path = strings.TrimRight(u.Path, "/")
	return u, nil
}

func Endpoint(addr, path string, query url.Values, websocket bool) (string, error) {
	u, err := Normalize(addr)
	if err != nil {
		return "", err
	}
	u.Path += path
	u.RawPath = ""
	u.RawQuery = query.Encode()
	if websocket {
		if u.Scheme == "https" {
			u.Scheme = "wss"
		} else {
			u.Scheme = "ws"
		}
	}
	return u.String(), nil
}

// SafeError removes URL query credentials from net/http errors before logging.
func SafeError(err error) error {
	var u *url.Error
	if errors.As(err, &u) {
		return u.Err
	}
	return err
}
