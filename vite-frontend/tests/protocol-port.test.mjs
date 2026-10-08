import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['src/utils/protocol-port.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { defaultProtocolPort, parseProtocolPort } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
test('only VLESS defaults to 443; other protocols request automatic allocation', () => {
  assert.equal(defaultProtocolPort('vless'), '443');
  for (const protocol of ['trojan', 'vmess', 'vmess-ws', 'shadowsocks', 'hysteria2', 'tuic', 'anytls'])
    assert.equal(parseProtocolPort(defaultProtocolPort(protocol)), undefined);
});
test('custom public ports allow integers only and enforce range', () => {
  for (const value of ['1', '443', '8443', '65535']) assert.equal(parseProtocolPort(value), Number(value));
  assert.equal(parseProtocolPort(''), undefined);
  for (const value of ['0', '65536', '-1', '443.5', '1e3', 'NaN', ' ', '443 ', 'Infinity'])
    assert.equal(parseProtocolPort(value), null, value);
});
