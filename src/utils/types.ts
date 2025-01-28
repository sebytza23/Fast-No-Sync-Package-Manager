import { PACKAGE_MANAGERS } from '@/utils/package-managers';

export type PackageManagerType = keyof typeof PACKAGE_MANAGERS;
export type PackageManagerLockFile = typeof PACKAGE_MANAGERS[PackageManagerType]['lockFiles'][number];
export type DetectionMode = 'auto' | 'default' | PackageManagerType;

export interface PackageManagerConfig {
  default: PackageManagerType;
  detection: DetectionMode;
}

export interface SymlinkConfig {
  enabled: boolean;
  addToGitIgnore: boolean;
  nosyncName: string;
}

export interface DebugConfig {
  verbose: boolean;
}

export interface Config {
  packageManager: PackageManagerConfig;
  symlink: SymlinkConfig;
  debug: DebugConfig;
}
