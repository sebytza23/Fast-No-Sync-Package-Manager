export const PACKAGE_MANAGERS = {
    npm: { lockFiles: ['package-lock.json', 'npm-shrinkwrap.json'] },
    yarn: { lockFiles: ['yarn.lock'] },
    pnpm: { lockFiles: ['pnpm-lock.yaml'] },
    bun: { lockFiles: ['bun.lockb', 'bun.lock'] },
    deno: { lockFiles: ['deno.lock'] },
} as const;

export type PackageManagerType = keyof typeof PACKAGE_MANAGERS;
export const VALID_PACKAGE_MANAGERS = Object.keys(
    PACKAGE_MANAGERS,
) as PackageManagerType[];

export function isPackageManager(value: unknown): value is PackageManagerType {
    return (
        typeof value === 'string' &&
        VALID_PACKAGE_MANAGERS.includes(value as PackageManagerType)
    );
}
