package socket

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-gost/x/config"
	traffic "github.com/go-gost/x/limiter/traffic"
	"github.com/go-gost/x/registry"
	"strconv"
	"strings"
	"sync"
)

var userLimitMu sync.Mutex

func (w *WebSocketReporter) handleSetUserLimit(data interface{}) error {
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	var cfg config.LimiterConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return err
	}
	return setUserLimit(cfg)
}

func setUserLimit(cfg config.LimiterConfig) error {
	name := strings.TrimSpace(cfg.Name)
	id, parseErr := strconv.ParseInt(name, 10, 64)
	if parseErr != nil || id < 800000000 || id >= 900000000 || cfg.UserBytesPerSecond == nil || *cfg.UserBytesPerSecond < 0 || *cfg.UserBytesPerSecond > 125000000000 {
		return errors.New("invalid user limiter name or byte rate")
	}
	userLimitMu.Lock()
	defer userLimitMu.Unlock()
	current := registry.TrafficLimiterRegistry().GetAll()[name]
	if current != nil {
		bucket, ok := current.(*traffic.UserLimiter)
		if !ok {
			return fmt.Errorf("limiter %s has incompatible type", name)
		}
		bucket.SetRate(*cfg.UserBytesPerSecond)
	} else if err := registry.TrafficLimiterRegistry().Register(name, traffic.NewUserLimiter(*cfg.UserBytesPerSecond)); err != nil {
		return err
	}
	cfg.Name = name
	config.OnUpdate(func(c *config.Config) error {
		for i, l := range c.Limiters {
			if l.Name == name {
				c.Limiters[i] = &cfg
				return nil
			}
		}
		c.Limiters = append(c.Limiters, &cfg)
		return nil
	})
	return nil
}
