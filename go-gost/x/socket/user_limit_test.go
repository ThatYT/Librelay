package socket

import (
	"context"
	"encoding/json"
	"github.com/go-gost/core/limiter"
	"github.com/go-gost/x/config"
	parser "github.com/go-gost/x/config/parsing/limiter"
	traffic "github.com/go-gost/x/limiter/traffic"
	"github.com/go-gost/x/registry"
	"testing"
)

func TestUserLimitSharesTCPUDPAndDirectionsAndUpdatesExistingBucket(t *testing.T) {
	name := "800000005"
	defer registry.TrafficLimiterRegistry().Unregister(name)
	old := config.Global()
	defer config.Set(old)
	config.Set(&config.Config{})
	speed := int64(6250000)
	cfg := config.LimiterConfig{Name: name, UserBytesPerSecond: &speed}
	if err := setUserLimit(cfg); err != nil {
		t.Fatal(err)
	}
	wrapped := registry.TrafficLimiterRegistry().Get(name)
	if wrapped.In(context.Background(), "tcp-connection", limiter.ScopeOption(limiter.ScopeConn)) != nil {
		t.Fatal("TCP connection wrapper would charge twice")
	}
	tcp := wrapped.In(context.Background(), "tcp-connection", limiter.ScopeOption(limiter.ScopeService))
	udp := wrapped.Out(context.Background(), "udp-client", limiter.ScopeOption(limiter.ScopeClient))
	if tcp != udp || tcp.Limit() != 6250000 {
		t.Fatal("protocols/directions do not share the account bucket")
	}
	speed = 1000000
	if err := setUserLimit(cfg); err != nil {
		t.Fatal(err)
	}
	if tcp.Limit() != 1000000 {
		t.Fatal("established connection retained old rate")
	}
	raw, err := json.Marshal(config.Global())
	if err != nil {
		t.Fatal(err)
	}
	var restarted config.Config
	if err = json.Unmarshal(raw, &restarted); err != nil {
		t.Fatal(err)
	}
	restored := parser.ParseTrafficLimiter(restarted.Limiters[0])
	if _, ok := restored.(*traffic.UserLimiter); !ok {
		t.Fatal("restart loses combined user limiter")
	}
	if restored.In(context.Background(), "tcp").Limit() != 1000000 {
		t.Fatal("restart loses rate")
	}
	speed = 0
	if err := setUserLimit(cfg); err != nil {
		t.Fatal(err)
	}
	if tcp.Limit() != 0 || tcp.Wait(context.Background(), 65536) != 65536 {
		t.Fatal("zero should remove speed cap without replacing the bucket")
	}
}
func TestUserLimitRejectsInvalidConfiguration(t *testing.T) {
	neg := int64(-1)
	for _, cfg := range []config.LimiterConfig{{Name: "800000005"}, {Name: "1", UserBytesPerSecond: &neg}, {Name: "800000005", UserBytesPerSecond: &neg}} {
		if setUserLimit(cfg) == nil {
			t.Fatal("invalid configuration accepted")
		}
	}
}
