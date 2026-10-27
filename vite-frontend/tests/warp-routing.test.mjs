import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['src/utils/warp-routing.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { defaultWarpPolicy, readWarpPolicy, warpFormPolicy } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
test('new and existing nodes default off with the deployed WARP endpoint and domain policy', () => {
  const policy = defaultWarpPolicy();
  assert.equal(policy.enabled, false); assert.equal(policy.port, 31000);
  assert.ok(policy.domains.includes('notebook.google'));
  assert.deepEqual(readWarpPolicy(null), policy);
  policy.enabled = true;
  assert.deepEqual(readWarpPolicy(JSON.stringify(policy)), policy);
  assert.equal(defaultWarpPolicy().enabled, false);
});
test('editing preserves enabled state and domains and rejects invalid local proxy ports', () => {
  assert.deepEqual(warpFormPolicy(true, '31000', 'google.com\nnotebook.google,google.com'), {
    enabled: true, port: 31000, domains: ['google.com', 'notebook.google'],
  });
  for (const port of ['0', '65536', '3.1', '1e3', '', '-1']) assert.equal(warpFormPolicy(true, port, 'google.com'), null);
  assert.equal(warpFormPolicy(true, '31000', ' \n '), null);
  assert.equal(warpFormPolicy(true, '31000', Array.from({length: 101}, (_, i) => `${i}.example`).join('\n')), null);
});
test('malformed saved policy is surfaced instead of presented as safely disabled', () => {
  for (const raw of ['{', 'null', '{}', '{"enabled":true,"port":0,"domains":[]}']) assert.throws(() => readWarpPolicy(raw));
});

test('manual setup commands use official signed packages, proxy mode and the selected port', async () => {
  const { warpSetupCommands } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  const commands = warpSetupCommands(32000);
  assert.ok(commands.includes('https://pkg.cloudflareclient.com/pubkey.gpg'));
  assert.ok(commands.includes('signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg'));
  assert.ok(commands.includes('mode proxy'));
  assert.ok(commands.includes('proxy port 32000'));
  assert.ok(commands.includes('socks5h://127.0.0.1:32000'));
  assert.ok(commands.includes('registration show >/dev/null 2>&1 ||'));
  assert.ok(!commands.includes('registration delete'));
  for (const port of [0, 65536, 3.5, NaN]) assert.throws(() => warpSetupCommands(port));
  const { spawnSync } = await import('node:child_process');
  const syntax = spawnSync('bash', ['-n'], { input: commands, encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});
