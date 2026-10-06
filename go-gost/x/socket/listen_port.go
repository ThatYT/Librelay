package socket

import (
	"encoding/json"
	"fmt"
	"net"
)

// Probe on the remote node, never on the panel host. TCP and UDP are separate.
func checkListenPort(data interface{}) error {
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	var req struct {
		Port    int    `json:"port"`
		Network string `json:"network"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		return err
	}
	if req.Port < 1 || req.Port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	addr := fmt.Sprintf(":%d", req.Port)
	switch req.Network {
	case "tcp":
		listener, err := net.Listen("tcp", addr)
		if err != nil {
			return fmt.Errorf("TCP port %d is unavailable on this node: %w", req.Port, err)
		}
		return listener.Close()
	case "udp":
		listener, err := net.ListenPacket("udp", addr)
		if err != nil {
			return fmt.Errorf("UDP port %d is unavailable on this node: %w", req.Port, err)
		}
		return listener.Close()
	default:
		return fmt.Errorf("network must be tcp or udp")
	}
}
