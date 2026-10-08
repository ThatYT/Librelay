package socket

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func runtimeFixture(t *testing.T) (string, string, string, string) {
	t.Helper()
	dir := t.TempDir()
	binary := filepath.Join(dir, "sing-box")
	configPath := filepath.Join(dir, "sing-box.json")
	unit := filepath.Join(dir, "sing-box.service")
	log := filepath.Join(dir, "commands")
	t.Setenv("RUNTIME_TEST_DIR", dir)
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	script := `#!/bin/sh
if [ "$1" = check ]; then
 if grep -q INVALID "$3"; then echo 'invalid fixture config'; exit 1; fi
 exit 0
fi
exit 1
`
	if err := os.WriteFile(binary, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	script = `#!/bin/sh
printf '%s\n' "$*" >> "$RUNTIME_TEST_DIR/commands"
case "$1" in
 daemon-reload) exit 0 ;;
 enable) [ "${FAIL_ENABLE:-0}" = 0 ]; exit $? ;;
 is-active) test -f "$RUNTIME_TEST_DIR/active"; exit $? ;;
 restart) [ "${FAIL_START:-0}" = 0 ] || exit 1
          [ "${EXIT_AFTER_START:-0}" = 0 ] && touch "$RUNTIME_TEST_DIR/active"
          exit 0 ;;
esac
exit 1
`
	if err := os.WriteFile(filepath.Join(dir, "systemctl"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	return binary, configPath, unit, log
}

func TestFreshRuntimeStartsWithoutPublicPorts(t *testing.T) {
	binary, configPath, unit, log := runtimeFixture(t)
	if err := prepareSingboxRuntimeAt(binary, configPath, unit); err != nil {
		t.Fatal(err)
	}
	config, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(config) != idleSingboxConfig || strings.Contains(string(config), "listen_port") {
		t.Fatal("fresh config opened a port")
	}
	fi, _ := os.Stat(configPath)
	if fi.Mode().Perm() != 0600 {
		t.Fatal("insecure config permissions")
	}
	commands, _ := os.ReadFile(log)
	if !strings.Contains(string(commands), "daemon-reload") || !strings.Contains(string(commands), "enable sing-box") || !strings.Contains(string(commands), "restart sing-box") {
		t.Fatal(string(commands))
	}
}

func TestRuntimeRepairPreservesProtocolsAndAvoidsRestart(t *testing.T) {
	binary, configPath, unit, log := runtimeFixture(t)
	original := `{"inbounds":[{"type":"vless","listen_port":8443,"users":[{"uuid":"fixture"}]}]}`
	os.WriteFile(configPath, []byte(original), 0600)
	if err := prepareSingboxRuntimeAt(binary, configPath, unit); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(configPath)
	if string(got) != original {
		t.Fatal("existing protocols overwritten")
	}
	os.WriteFile(log, nil, 0600)
	if err := prepareSingboxRuntimeAt(binary, configPath, unit); err != nil {
		t.Fatal(err)
	}
	commands, _ := os.ReadFile(log)
	if strings.Contains(string(commands), "restart") || strings.Contains(string(commands), "daemon-reload") {
		t.Fatal("idempotent setup restarted runtime")
	}
}

func TestInvalidExistingConfigIsPreservedAndServiceUntouched(t *testing.T) {
	binary, configPath, unit, log := runtimeFixture(t)
	os.WriteFile(configPath, []byte("INVALID fixture"), 0600)
	if err := prepareSingboxRuntimeAt(binary, configPath, unit); err == nil {
		t.Fatal("accepted invalid config")
	}
	got, _ := os.ReadFile(configPath)
	if string(got) != "INVALID fixture" {
		t.Fatal("invalid config erased")
	}
	if _, err := os.Stat(log); !os.IsNotExist(err) {
		t.Fatal("service modified before validation")
	}
}

func TestRuntimeCannotReportSuccessOnSystemdFailure(t *testing.T) {
	for _, failure := range []string{"FAIL_ENABLE", "FAIL_START", "EXIT_AFTER_START"} {
		t.Run(failure, func(t *testing.T) {
			binary, configPath, unit, _ := runtimeFixture(t)
			t.Setenv(failure, "1")
			if err := prepareSingboxRuntimeAt(binary, configPath, unit); err == nil {
				t.Fatal("false readiness success")
			}
		})
	}
}

func TestIdleConfigCompatibleWithSingbox(t *testing.T) {
	binary := os.Getenv("LIBRELAY_SINGBOX_TEST_BIN")
	if binary == "" {
		t.Skip("set LIBRELAY_SINGBOX_TEST_BIN to test with the actual sing-box release")
	}
	path := filepath.Join(t.TempDir(), "sing-box.json")
	if err := os.WriteFile(path, []byte(idleSingboxConfig), 0600); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command(binary, "check", "-c", path).CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cmd := exec.CommandContext(ctx, binary, "run", "-c", path)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		t.Fatalf("idle runtime exited: %v", err)
	case <-time.After(300 * time.Millisecond):
		cancel()
		<-done
	}
}
