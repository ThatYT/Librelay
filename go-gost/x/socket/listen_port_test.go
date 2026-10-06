package socket

import (
	"net"
	"strconv"
	"strings"
	"testing"
)

func TestListenPortTransportIsolation(t *testing.T) {
	tcp, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatal(err)
	}
	defer tcp.Close()
	_, value, _ := net.SplitHostPort(tcp.Addr().String())
	port, _ := strconv.Atoi(value)
	if err := checkListenPort(map[string]interface{}{"port": port, "network": "tcp"}); err == nil || !strings.Contains(err.Error(), "TCP port") {
		t.Fatalf("expected clear TCP conflict: %v", err)
	}
	if err := checkListenPort(map[string]interface{}{"port": port, "network": "udp"}); err != nil {
		t.Fatalf("TCP must not reserve UDP: %v", err)
	}
}
func TestUDPDoesNotReserveTCP(t *testing.T) {
	udp, err := net.ListenPacket("udp", ":0")
	if err != nil {
		t.Fatal(err)
	}
	defer udp.Close()
	_, value, _ := net.SplitHostPort(udp.LocalAddr().String())
	port, _ := strconv.Atoi(value)
	if err := checkListenPort(map[string]interface{}{"port": port, "network": "tcp"}); err != nil {
		t.Fatalf("UDP must not reserve TCP: %v", err)
	}
	if err := checkListenPort(map[string]interface{}{"port": port, "network": "udp"}); err == nil {
		t.Fatal("expected UDP conflict")
	}
}
func TestListenPortValidation(t *testing.T) {
	for _, port := range []int{0, -1, 65536} {
		if checkListenPort(map[string]interface{}{"port": port, "network": "tcp"}) == nil {
			t.Fatalf("accepted %d", port)
		}
	}
	if checkListenPort(map[string]interface{}{"port": 443, "network": "invalid"}) == nil {
		t.Fatal("accepted invalid network")
	}
}
