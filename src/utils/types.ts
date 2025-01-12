export type PackageManagerType = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'deno';
export type PackageManagerLockFile = 'package-lock.json' | 'yarn.lock' | 'pnpm-lock.yaml' | 'bun.lockb' | 'deno.lock';
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
