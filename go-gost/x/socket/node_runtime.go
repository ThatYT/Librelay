package socket

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"time"
)

// PrepareNodeRuntime is used synchronously by installation and update.
// Existing protocol configurations are never replaced with an empty config.
func PrepareNodeRuntime() error {
	singboxMu.Lock()
	defer singboxMu.Unlock()
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		return err
	}
	if err := ensureSingboxInstalled(""); err != nil {
		return err
	}
	if err := ensureSelfCert(); err != nil {
		return err
	}
	if err := prepareSingboxRuntimeAt(singboxBinPath(), singboxConfigPath(), singboxServiceUnit); err != nil {
		setSingboxInstallErr(err.Error())
		return err
	}
	setSingboxInstallErr("")
	return nil
}

const idleSingboxConfig = `{"log":{"level":"warn"},"inbounds":[],"outbounds":[{"type":"direct","tag":"direct"}]}`

func prepareSingboxRuntimeAt(binary, configPath, unitPath string) error {
	// O_EXCL protects existing configs, including invalid ones that need diagnosis.
	f, err := os.OpenFile(configPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err == nil {
		_, err = f.WriteString(idleSingboxConfig)
		closeErr := f.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
	} else if !os.IsExist(err) {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if out, err := exec.CommandContext(ctx, binary, "check", "-c", configPath).CombinedOutput(); err != nil {
		return fmt.Errorf("existing sing-box configuration failed validation (preserved at %s): %v: %s", configPath, err, out)
	}
	if err := ensureSingboxServiceAt(binary, configPath, unitPath); err != nil {
		return err
	}
	if out, err := exec.Command("systemctl", "enable", "sing-box").CombinedOutput(); err != nil {
		return fmt.Errorf("cannot enable sing-box: %v: %s", err, out)
	}
	// Preserve an already running service; only recover a stopped/missing service.
	if exec.Command("systemctl", "is-active", "--quiet", "sing-box").Run() == nil {
		return nil
	}
	if out, err := exec.Command("systemctl", "restart", "sing-box").CombinedOutput(); err != nil {
		return fmt.Errorf("cannot start sing-box: %v: %s", err, out)
	}
	time.Sleep(300 * time.Millisecond)
	if exec.Command("systemctl", "is-active", "--quiet", "sing-box").Run() != nil {
		return fmt.Errorf("sing-box did not stay running; check journalctl -u sing-box (configuration preserved at %s)", configPath)
	}
	return nil
}
