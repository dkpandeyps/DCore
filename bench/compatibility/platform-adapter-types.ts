// M13-UNIVERSAL — Platform adapter types. Adapters isolate platform-specific identity normalization behind a stable
// interface. They expose ONLY what they can actually establish and contain NO baked behavioral assumptions
// ("if windows then assume X"). Compatibility always comes from the registry + evidence, never from the adapter.
import type { Platform } from './universal-compatibility-types.ts';

export interface PlatformAdapter {
  schema: 'dkskill.platform_adapter/1';
  adapter_id: string;
  platform: Platform;
  os_aliases: string[];              // raw OS strings this adapter recognizes (e.g. 'win32','windows','Windows 11')
  registry_platform_token: string;  // the exact token used in the compatibility registry (e.g. 'win32')
  supported_architectures: string[];
  supported_channels: string[];
  // Capabilities this adapter is ABLE to gather evidence for. This never fabricates a capability STATE; the state
  // still comes from the certified profile/evidence. It only bounds what the adapter can contribute.
  establishable_capabilities: string[];
  assumes_behavior: false;          // structurally: adapters never assume behavior
}
