'use strict';
// Structural checks for the browser app. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('HubAccounts.html');
const loaded = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
const onDisk = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`);

test('every feature script is loaded exactly once and exists', () => {
  assert.equal(new Set(loaded).size, loaded.length, 'duplicate <script> tag');
  assert.deepEqual([...loaded].sort(), [...onDisk].sort());
  assert.equal(loaded.at(-1), 'js/app.js', 'boot script must load last');
});

test('every feature script parses', () => {
  for (const file of loaded) assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }), file);
});

test('no top-level name is declared in two scripts', () => {
  const seen = new Map();
  for (const file of loaded) {
    for (const m of read(file).matchAll(/^(?:async\s+)?(?:function\s+|const\s+|let\s+)([A-Za-z_$][\w$]*)/gm)) {
      assert.ok(!seen.has(m[1]), `${m[1]} declared in ${seen.get(m[1])} and ${file}`);
      seen.set(m[1], file);
    }
  }
});

test('every i18n key the app looks up is defined', () => {
  const defined = new Set([...read('js/i18n.js').matchAll(/^\s+([a-z0-9_]+):\s+\{ vi:/gm)].map(m => m[1]));
  const used = new Set();
  for (const file of loaded) for (const m of read(file).matchAll(/\bt\('([a-z0-9_]+)'\)/g)) used.add(m[1]);
  // statusMeta() builds its key dynamically: t('status_' + status)
  const statusBlock = read('js/core.js').match(/const STATUS_META = \{([\s\S]*?)\n\};/)[1];
  for (const m of statusBlock.matchAll(/^\s+([a-z]+):/gm)) used.add(`status_${m[1]}`);
  const missing = [...used].filter(key => !defined.has(key));
  assert.deepEqual(missing, []);
});

test('service worker caches every file the page needs', () => {
  const sw = read('sw.js');
  for (const file of ['HubAccounts.html', 'index.html', 'hubaccounts.css', 'manifest.json', 'icon-192.png', 'icon-512.png', ...loaded]) {
    assert.ok(sw.includes(`'./${file}'`), `${file} missing from APP_SHELL`);
  }
});

test('biometric unlock never stores the raw vault key', () => {
  const auth = read('js/auth.js');
  assert.ok(!/keyB64\s*[,:]/.test(auth.replace(/\/\/.*$/gm, '')), 'raw key field written to storage');
  assert.match(auth, /extensions:\s*\{\s*prf/);
});

test('AI key check never falls back to sending a plain password', () => {
  assert.ok(!/pw\.length\s*>/.test(read('js/status-check.js')));
});

test('showConfirm is always called with positional arguments', () => {
  for (const file of loaded) assert.ok(!/showConfirm\(\s*\{/.test(read(file)), file);
});

test('locking the vault also closes the Ctrl+K palette', () => {
  const endSession = read('js/shell.js').match(/function endSession\(\)\{[\s\S]*?\n\}/)[0];
  assert.match(endSession, /closeCommandPalette\(\)/);
  assert.match(endSession, /commandPaletteFilteredEntries = \[\]/);
});

test('every file listed in the service worker cache exists', () => {
  // One missing file makes cache.addAll() fail, silently disabling offline use.
  const shell = read('sw.js').match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
  for (const m of shell.matchAll(/'\.\/([^']+)'/g)) assert.ok(fs.existsSync(path.join(root, m[1])), m[1]);
});
