import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '@typescript/typescript6';

const startup = fs.readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const hook = ts.transpileModule(fs.readFileSync('src/presentation/shell/use-theme.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const preferenceAdapter = ts.transpileModule(fs.readFileSync('src/shared/infrastructure/browser-theme-preference.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
for (const [saved, systemDark, blocked, expected] of [
  [null, false, false, 'light'], [null, true, false, 'dark'],
  ['light', true, false, 'light'], ['dark', false, false, 'dark'],
  ['invalid', true, false, 'dark'], [null, true, true, 'dark'],
]) {
  let preference = saved, state, browserColor;
  const root = { dataset: {} };
  const context = vm.createContext({
    document: { documentElement: root, querySelector: () => ({ setAttribute: (_, value) => { browserColor = value; } }) },
    window: { matchMedia: () => ({ matches: systemDark }) },
    localStorage: {
      getItem: () => { if (blocked) throw Error('Storage unavailable'); return preference; },
      setItem: (key, value) => { assert.equal(key, 'akamonkai.theme'); if (blocked) throw Error('Storage unavailable'); preference = value; },
    },
    require: name => name === 'react'
      ? { useState: initial => [state = initial(), next => { state = next; }], useEffect: effect => effect() }
      : { useStudy: () => ({ services: { appearance: new context.exports.BrowserThemePreference() } }) },
    exports: {},
  });
  vm.runInContext(startup, context);
  assert.equal(root.dataset.theme, expected, 'Saved preference must override system appearance before rendering');
  assert.equal(browserColor, expected === 'dark' ? '#101827' : '#f5f7fb');
  vm.runInContext(preferenceAdapter, context);
  vm.runInContext(hook, context);
  const controls = context.exports.useTheme();
  assert.equal(controls.theme, expected);
  for (const next of ['light', 'dark']) {
    controls.selectTheme(next);
    assert.equal(state, next);
    assert.equal(root.dataset.theme, next);
    assert.equal(browserColor, next === 'dark' ? '#101827' : '#f5f7fb');
    if (!blocked) {
      assert.equal(preference, next);
      vm.runInContext(startup, context);
      assert.equal(root.dataset.theme, next, 'Reload must preserve the chosen theme');
    }
  }
}
console.log(JSON.stringify({ themes: 'passed', systemDefaultAndSavedOverride: 'passed', reloadPersistenceAndStorageFailure: 'passed' }));
