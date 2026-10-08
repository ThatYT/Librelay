package traffic

import (
	"context"
	"testing"
	"time"
)

func TestAggregateRateUnderConcurrentUploadAndDownload(t *testing.T) {
	l := NewUserLimiter(200000)
	// Allow the initial half-second burst, then measure BOTH directions sharing one rate.
	started := time.Now()
	done := make(chan int, 2)
	for _, bucket := range []interface {
		Wait(context.Context, int) int
	}{l.In(context.Background(), "tcp"), l.Out(context.Background(), "udp")} {
		go func(b interface {
			Wait(context.Context, int) int
		}) { total := 0; for total < 200000 {
			total += b.Wait(context.Background(), 10000)
		}; done <- total }(bucket)
	}
	bytes := <-done
	bytes += <-done
	elapsed := time.Since(started)
	if bytes != 400000 || elapsed < 1400*time.Millisecond {
		t.Fatalf("directions bypass aggregate cap: bytes=%d elapsed=%s", bytes, elapsed)
	}
}
