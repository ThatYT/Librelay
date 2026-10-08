import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/utils/subscription-url.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { subscriptionUrl } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('native subscriptions use the selected panel port and path', () => {
  assert.equal(subscriptionUrl('sub', 'abc', 'https://panel.example.com:2095/api/v1/'), 'https://panel.example.com:2095/api/v1/open_api/sub?token=abc');
  assert.equal(subscriptionUrl('clash', 'abc', 'https://panel.example.com/prefix/api/v1'), 'https://panel.example.com/prefix/api/v1/open_api/clash?token=abc');
});
test('web subscription URLs retain the public panel origin and encode tokens', () => {
  assert.equal(subscriptionUrl('sub', 'a+b&c', 'http://192.0.2.1:8080/api/v1/'), 'http://192.0.2.1:8080/api/v1/open_api/sub?token=a%2Bb%26c');
});
