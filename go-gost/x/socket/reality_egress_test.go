package socket

import (
	"bytes"
	"encoding/json"
	"github.com/go-gost/core/logger"
	"github.com/go-gost/core/observer/stats"
	"github.com/go-gost/gosocks5"
	"github.com/go-gost/x/config"
	_ "github.com/go-gost/x/connector/socks/v5"
	_ "github.com/go-gost/x/dialer/tcp"
	_ "github.com/go-gost/x/handler/socks/v5"
	_ "github.com/go-gost/x/listener/tcp"
	xlogger "github.com/go-gost/x/logger"
	"github.com/go-gost/x/registry"
	xservice "github.com/go-gost/x/service"
	"golang.org/x/net/proxy"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func unusedAddress(t *testing.T) string {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	listener.Close()
	return address
}
func TestPrivateRealityEgressAndLifecycle(t *testing.T) {
	oldLogger := logger.Default()
	logger.SetDefault(xlogger.NewLogger(xlogger.OutputOption(io.Discard)))
	if oldLogger != nil {
		defer logger.SetDefault(oldLogger)
	}
	xservice.SetProtocolBlock(0, 0, 1)
	defer xservice.SetProtocolBlock(0, 0, 0)
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "metered traffic") }))
	defer target.Close()
	gatewayAddress, userAddress := unusedAddress(t), unusedAddress(t)
	var services []config.ServiceConfig
	raw, _ := json.Marshal([]map[string]interface{}{
		{"name": "test-gateway", "addr": gatewayAddress, "metadata": map[string]interface{}{"tms.privateEgress": true}, "handler": map[string]interface{}{"type": "socks5", "metadata": map[string]interface{}{"udp": true, "notls": true}}, "listener": map[string]interface{}{"type": "tcp"}},
		{"name": "123_7_0_tcp", "addr": userAddress, "metadata": map[string]interface{}{"tms.privateEgress": true}, "handler": map[string]interface{}{"type": "socks5", "chain": "123_7_0_chains", "metadata": map[string]interface{}{"udp": true, "notls": true}}, "listener": map[string]interface{}{"type": "tcp"}},
	})
	if err := json.Unmarshal(raw, &services); err != nil {
		t.Fatal(err)
	}
	var chain config.ChainConfig
	raw, _ = json.Marshal(map[string]interface{}{"name": "123_7_0_chains", "hops": []interface{}{map[string]interface{}{"name": "gateway", "nodes": []interface{}{map[string]interface{}{"name": "gateway", "addr": gatewayAddress, "connector": map[string]interface{}{"type": "socks5", "metadata": map[string]interface{}{"udp": true, "notls": true}}, "dialer": map[string]interface{}{"type": "tcp"}}}}}})
	json.Unmarshal(raw, &chain)
	if err := createChain(createChainRequest{Data: chain}); err != nil {
		t.Fatal(err)
	}
	defer deleteChain(deleteChainRequest{Chain: chain.Name})
	if err := createServices(createServicesRequest{Data: services}); err != nil {
		t.Fatal(err)
	}
	defer deleteServices(deleteServicesRequest{Services: []string{"test-gateway", "123_7_0_tcp", "123_7_0_udp"}})
	dialer, err := proxy.SOCKS5("tcp", userAddress, nil, &net.Dialer{Timeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: &http.Transport{Dial: dialer.Dial}, Timeout: 3 * time.Second}
	response, err := client.Get(target.URL)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(response.Body)
	response.Body.Close()
	client.CloseIdleConnections()
	if string(body) != "metered traffic" {
		t.Fatalf("bad egress response: %s", body)
	}

	// UDP payload also uses the private chain and must increment the service's counters.
	echo, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer echo.Close()
	go func() {
		buffer := make([]byte, 1024)
		n, source, e := echo.ReadFrom(buffer)
		if e == nil {
			echo.WriteTo(buffer[:n], source)
		}
	}()
	control, err := net.DialTimeout("tcp", userAddress, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer control.Close()
	control.SetDeadline(time.Now().Add(3 * time.Second))
	control.Write([]byte{5, 1, 0})
	negotiation := make([]byte, 2)
	if _, err := io.ReadFull(control, negotiation); err != nil {
		t.Fatal(err)
	}
	address, _ := gosocks5.NewAddr("0.0.0.0:0")
	if err := gosocks5.NewRequest(gosocks5.CmdUdp, address).Write(control); err != nil {
		t.Fatal(err)
	}
	reply, err := gosocks5.ReadReply(control)
	if err != nil || reply.Rep != gosocks5.Succeeded {
		t.Fatalf("UDP association failed: %v %v", reply, err)
	}
	udpAddr, err := net.ResolveUDPAddr("udp", reply.Addr.String())
	if err != nil {
		t.Fatal(err)
	}
	udp, err := net.DialUDP("udp", nil, udpAddr)
	if err != nil {
		t.Fatal(err)
	}
	defer udp.Close()
	udp.SetDeadline(time.Now().Add(3 * time.Second))
	destination, _ := gosocks5.NewAddr(echo.LocalAddr().String())
	datagram := gosocks5.NewUDPDatagram(gosocks5.NewUDPHeader(0, 0, destination), []byte("udp accounting"))
	var packet bytes.Buffer
	datagram.WriteTo(&packet)
	udp.Write(packet.Bytes())
	buffer := make([]byte, 1024)
	n, err := udp.Read(buffer)
	if err != nil {
		t.Fatalf("UDP did not traverse metered egress: %v", err)
	}
	result := &gosocks5.UDPDatagram{}
	_, err = result.ReadFrom(bytes.NewReader(buffer[:n]))
	if err != nil || string(result.Data) != "udp accounting" {
		t.Fatalf("bad UDP response: %v %v", result, err)
	}
	status := registry.ServiceRegistry().Get("123_7_0_tcp").(interface{ Status() *xservice.Status }).Status()
	if status.Stats().Get(stats.KindInputBytes) <= 0 || status.Stats().Get(stats.KindOutputBytes) <= 0 {
		t.Fatal("traffic was not counted")
	}
	control.Close()
	if !isSocksUDPCompanion("123_7_0_udp") {
		t.Fatal("TCP-only SOCKS service not recognized")
	}
	if err := pauseServices(pauseServicesRequest{Services: []string{"123_7_0_tcp", "123_7_0_udp"}}); err != nil {
		t.Fatal(err)
	}
	if err := resumeServices(resumeServicesRequest{Services: []string{"123_7_0_tcp", "123_7_0_udp"}}); err != nil {
		t.Fatal(err)
	}
	response, err = client.Get(target.URL)
	if err != nil {
		t.Fatalf("egress did not resume: %v", err)
	}
	response.Body.Close()
	client.CloseIdleConnections()
	if registry.ServiceRegistry().Get("123_7_0_udp") != nil {
		t.Fatal("unexpected UDP listener")
	}
}
