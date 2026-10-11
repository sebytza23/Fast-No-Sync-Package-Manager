import type { PACKAGE_MANAGERS, PackageManagerType } from './package-managers';
export type { PackageManagerType } from './package-managers';
export type PackageManagerLockFile =
    (typeof PACKAGE_MANAGERS)[PackageManagerType]['lockFiles'][number];
export type DetectionMode = 'auto' | 'default' | PackageManagerType;

export interface PackageManagerConfig {
    default: PackageManagerType;
    detection: DetectionMode;
}
export interface SymlinkConfig {
    enabled: boolean;
    addToGitIgnore: boolean;
    /** A single directory name inside the project. */
    nosyncName: string;
    /** Absolute dedicated destination, or 'auto' for managed external storage on the same filesystem. */
    storagePath?: string;
}
export interface DebugConfig {
    verbose: boolean;
}
export interface Config {
    packageManager: PackageManagerConfig;
    symlink: SymlinkConfig;
    debug: DebugConfig;
}
/** Configuration files may override individual settings without repeating defaults. */
export interface UserConfig {
    packageManager?: Partial<PackageManagerConfig>;
    symlink?: Partial<SymlinkConfig>;
    debug?: Partial<DebugConfig>;
}
