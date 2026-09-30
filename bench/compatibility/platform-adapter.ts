// M13-UNIVERSAL — Platform adapters. Deterministic identity normalization only; NO baked behavioral assumptions.
// The registry platform token is what M3 resolution matches against; adapters map raw OS strings to that token.
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import type { PlatformAdapter } from './platform-adapter-types.ts';
import type { Platform } from './universal-compatibility-types.ts';

// Capability ids the adapters can gather evidence for (bounds contribution only; never sets a STATE).
const CAP_IDS = buildCatalogue().capabilities.map((c) => c.id);

export const WINDOWS_ADAPTER: PlatformAdapter = {
  schema: 'dkskill.platform_adapter/1', adapter_id: 'WindowsAdapter', platform: 'windows',
  os_aliases: ['win32', 'windows', 'Windows 10', 'Windows 11'], registry_platform_token: 'win32',
  supported_architectures: ['x64', 'arm64'], supported_channels: ['native', 'npm', 'stable'],
  establishable_capabilities: CAP_IDS, assumes_behavior: false,
};
export const MACOS_ADAPTER: PlatformAdapter = {
  schema: 'dkskill.platform_adapter/1', adapter_id: 'MacOSAdapter', platform: 'macos',
  os_aliases: ['darwin', 'macos', 'macOS', 'osx'], registry_platform_token: 'darwin',
  supported_architectures: ['arm64', 'x64'], supported_channels: ['native', 'npm', 'stable'],
  establishable_capabilities: CAP_IDS, assumes_behavior: false,
};
export const LINUX_ADAPTER: PlatformAdapter = {
  schema: 'dkskill.platform_adapter/1', adapter_id: 'LinuxAdapter', platform: 'linux',
  os_aliases: ['linux', 'Linux'], registry_platform_token: 'linux',
  supported_architectures: ['x64', 'arm64'], supported_channels: ['native', 'npm', 'stable'],
  establishable_capabilities: CAP_IDS, assumes_behavior: false,
};
export const PLATFORM_ADAPTERS: PlatformAdapter[] = [WINDOWS_ADAPTER, MACOS_ADAPTER, LINUX_ADAPTER];

export function selectAdapter(os: string | null): PlatformAdapter | null {
  if (!os) return null;
  const norm = os.toLowerCase();
  return PLATFORM_ADAPTERS.find((a) => a.os_aliases.some((al) => al.toLowerCase() === norm || norm.startsWith(al.toLowerCase()))) ?? null;
}
export function platformToken(adapter: PlatformAdapter): string { return adapter.registry_platform_token; }
export function adapterSupportsArchitecture(adapter: PlatformAdapter, arch: string | null): boolean {
  return !!arch && adapter.supported_architectures.includes(arch);
}
export function adapterSupportsChannel(adapter: PlatformAdapter, channel: string | null): boolean {
  return !!channel && adapter.supported_channels.includes(channel);
}
