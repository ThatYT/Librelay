package socket

import (
	"github.com/go-gost/x/config"
	"os"
	"path/filepath"
	"sync"
)

var configSaveMu sync.Mutex

// Acknowledged node budgets must survive a restart. Write and fsync a private
// temporary file before replacing gost.json, rather than truncating the live file.
func saveConfig() error {
	configSaveMu.Lock()
	defer configSaveMu.Unlock()
	dir := "."
	file, err := os.CreateTemp(dir, ".gost-config-*")
	if err != nil {
		return err
	}
	path := file.Name()
	defer os.Remove(path)
	if err = config.Global().Write(file, "json"); err != nil {
		file.Close()
		return err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	if err = os.Rename(path, filepath.Join(dir, "gost.json")); err != nil {
		return err
	}
	directory, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
