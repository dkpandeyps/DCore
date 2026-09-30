import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLATFORM_ADAPTERS, WINDOWS_ADAPTER, MACOS_ADAPTER, LINUX_ADAPTER, selectAdapter, platformToken,
  adapterSupportsArchitecture, adapterSupportsChannel,
} from '../compatibility/platform-adapter.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');

test('1. three adapters (windows/macos/linux); schema; no baked behavior', () => {
  assert.equal(PLATFORM_ADAPTERS.length, 3);
  assert.ok(PLATFORM_ADAPTERS.every((a) => a.schema === 'dkskill.platform_adapter/1'));
  assert.ok(PLATFORM_ADAPTERS.every((a) => a.assumes_behavior === false));
});

test('2. os alias -> adapter selection', () => {
  assert.equal(selectAdapter('Windows 11')?.adapter_id, 'WindowsAdapter');
  assert.equal(selectAdapter('darwin')?.adapter_id, 'MacOSAdapter');
  assert.equal(selectAdapter('linux')?.adapter_id, 'LinuxAdapter');
  assert.equal(selectAdapter('plan9'), null);
  assert.equal(selectAdapter(null), null);
});

test('3. registry platform token mapping', () => {
  assert.equal(platformToken(WINDOWS_ADAPTER), 'win32');
  assert.equal(platformToken(MACOS_ADAPTER), 'darwin');
  assert.equal(platformToken(LINUX_ADAPTER), 'linux');
});

test('4. architecture support is explicit per adapter', () => {
  assert.equal(adapterSupportsArchitecture(WINDOWS_ADAPTER, 'x64'), true);
  assert.equal(adapterSupportsArchitecture(WINDOWS_ADAPTER, 'sparc'), false);
  assert.equal(adapterSupportsArchitecture(MACOS_ADAPTER, 'arm64'), true);
  assert.equal(adapterSupportsArchitecture(LINUX_ADAPTER, null), false);
});

test('5. channel support is explicit per adapter', () => {
  assert.equal(adapterSupportsChannel(WINDOWS_ADAPTER, 'native'), true);
  assert.equal(adapterSupportsChannel(WINDOWS_ADAPTER, 'canary'), false);
});

test('6. adapters expose establishable capabilities but never a capability STATE', () => {
  assert.ok(WINDOWS_ADAPTER.establishable_capabilities.length > 0);
  // the adapter object carries no capability state / verification field
  assert.equal((WINDOWS_ADAPTER as any).capability_states, undefined);
});

test('7. adapter modules contain no baked "if windows then assume" behavior / no network', () => {
  const mod = readFileSync(join(DIR, 'platform-adapter.ts'), 'utf8');
  assert.ok(!/assume|fetch\(|http\.request|https\.request|child_process|execSync/.test(mod.replace(/assumes_behavior/g, '')));
});

test('8. determinism', () => {
  assert.equal(selectAdapter('macOS')?.platform, 'macos');
  assert.equal(selectAdapter('Windows 10')?.platform, 'windows');
});
