import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true });
memory.set('tms.language', 'zh-CN');
const classes = new Set();
globalThis.document = { documentElement: { lang: '', style: {}, classList: { add: (...values) => values.forEach(v => classes.add(v)), remove: (...values) => values.forEach(v => classes.delete(v)) } } };
const directory = await mkdtemp(path.join(tmpdir(), 'librelay-ui-tests-'));
const bundle = path.join(directory, 'ui.mjs');
await build({ stdin: { contents: 'export { default as i18n, t, initialLanguage } from "./src/i18n"; export * from "./src/config/skins"; export { serverMessage } from "./src/utils/toast";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'silent' });
const { i18n, t, initialLanguage, SKINS, savedSkin, applySkin, serverMessage } = await import(pathToFileURL(bundle));
const en = JSON.parse(await readFile('src/locales/en-US.json', 'utf8'));
const zh = JSON.parse(await readFile('src/locales/zh-CN.json', 'utf8'));

test('browser locale and persisted language precedence', () => {
  assert.equal(i18n.language, 'zh-CN');
  assert.equal(initialLanguage(null, 'zh-TW'), 'zh-CN');
  assert.equal(initialLanguage(null, 'fr-FR'), 'en-US');
  assert.equal(initialLanguage('en-US', 'zh-CN'), 'en-US');
  assert.equal(initialLanguage('zh-CN', 'en-US'), 'zh-CN');
  assert.equal(initialLanguage('invalid', 'en-US'), 'en-US');
});
test('all messages switch Chinese → English → Chinese and persist', async () => {
  for (const language of ['zh-CN', 'en-US', 'zh-CN']) {
    await i18n.changeLanguage(language);
    assert.equal(memory.get('librelay.language'), language);
    assert.equal(document.documentElement.lang, language);
    const catalog = language === 'en-US' ? en : zh;
    for (const [key, message] of Object.entries(catalog)) {
      if (!message.includes('{{')) assert.equal(t(key), message, key);
    }
  }
});
test('backend notifications translate without mutating API messages', async () => {
  const response = { code: -1, msg: '节点不存在' };
  await i18n.changeLanguage('en-US');
  assert.equal(serverMessage(response.msg), 'Node not found');
  assert.equal(response.msg, '节点不存在');
  await i18n.changeLanguage('zh-CN');
  assert.equal(serverMessage(response.msg), '节点不存在');
});
test('catalogs have complete English translations and matching interpolation', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const key of Object.keys(zh)) {
    assert.ok(en[key].length > 0, key);
    assert.ok(!/[\u3400-\u9fff]/.test(en[key]), key);
    assert.deepEqual(en[key].match(/\{\{\w+\}\}/g)?.sort(), zh[key].match(/\{\{\w+\}\}/g)?.sort(), key);
  }
});
test('only Light/Dark, theme persistence, and legacy skin migration', () => {
  assert.deepEqual(SKINS.map(s => s.id), ['light', 'dark']);
  applySkin('dark'); assert.equal(savedSkin().id, 'dark'); assert.ok(classes.has('dark')); assert.equal(document.documentElement.style.colorScheme, 'dark');
  applySkin('light'); assert.equal(savedSkin().id, 'light'); assert.ok(classes.has('light')); assert.ok(!classes.has('dark'));
  memory.set('skin', 'aurora'); assert.equal(savedSkin().id, 'dark'); applySkin(savedSkin().id); assert.equal(memory.get('skin'), 'dark');
  memory.set('skin', 'mint'); assert.equal(savedSkin().id, 'light');
});
test.after(async () => { await rm(directory, { recursive: true }); });
