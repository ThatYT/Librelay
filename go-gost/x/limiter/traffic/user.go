package traffic

import (
	"context"
	core "github.com/go-gost/core/limiter"
	traffic "github.com/go-gost/core/limiter/traffic"
	"golang.org/x/time/rate"
	"sync"
)

// UserLimiter shares one bucket across services, TCP/UDP and BOTH directions.
// Updates retain the bucket, so established connections see the new budget.
type UserLimiter struct {
	mu     sync.RWMutex
	bucket *rate.Limiter
	bytes  int64
}

func NewUserLimiter(bytes int64) *UserLimiter {
	l := &UserLimiter{bucket: rate.NewLimiter(1, 1)}
	l.SetRate(bytes)
	return l
}
func (l *UserLimiter) SetRate(bytes int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.bytes = bytes
	if bytes == 0 {
		l.bucket.SetLimit(rate.Inf)
		l.bucket.SetBurst(maxBurst)
	} else {
		l.bucket.SetLimit(rate.Limit(bytes))
		l.bucket.SetBurst(burstOf(int(bytes)))
	}
}

// TCP listeners wrap each connection twice: service and connection scopes.
// This is one shared account bucket, so charge at service/client scope only.
func (l *UserLimiter) scope(opts ...core.Option) traffic.Limiter {
	var options core.Options
	for _, opt := range opts {
		opt(&options)
	}
	if options.Scope == core.ScopeConn {
		return nil
	}
	return l
}
func (l *UserLimiter) In(ctx context.Context, key string, opts ...core.Option) traffic.Limiter {
	return l.scope(opts...)
}
func (l *UserLimiter) Out(ctx context.Context, key string, opts ...core.Option) traffic.Limiter {
	return l.scope(opts...)
}
func (l *UserLimiter) Wait(ctx context.Context, n int) int {
	l.mu.RLock()
	bytes, burst := l.bytes, l.bucket.Burst()
	l.mu.RUnlock()
	if bytes == 0 {
		return n
	}
	if n > burst {
		n = burst
	}
	if err := l.bucket.WaitN(ctx, n); err != nil {
		return 0
	}
	return n
}
func (l *UserLimiter) Limit() int { l.mu.RLock(); defer l.mu.RUnlock(); return int(l.bytes) }
func (l *UserLimiter) Set(n int)  { l.SetRate(int64(n)) }
