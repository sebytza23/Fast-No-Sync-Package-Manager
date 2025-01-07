export type PackageManagerType = 'npm' | 'pnpm' | 'yarn' | 'deno' | 'bun' | 'invalid';
export type PackageManagerLockFile = 'package-lock.json' | 'yarn.lock' | 'pnpm-lock.yaml' | 'bun.lockb' | 'deno.lock';
export type PackageManagerName = PackageManagerType;