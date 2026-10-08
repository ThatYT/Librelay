import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['src/config/brand.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { APP_NAME, panelName } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
test('new and legacy default panel names use Librelay, custom names survive', () => {
  assert.equal(APP_NAME, 'Librelay');
  for (const value of [null, undefined, '', 'TMS', 'Librelay']) assert.equal(panelName(value), 'Librelay');
  for (const value of ['My panel', 'TMS Community', '自由']) assert.equal(panelName(value), value);
});
