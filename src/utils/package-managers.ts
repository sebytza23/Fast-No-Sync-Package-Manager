import { PackageManagerType, PackageManagerLockFile } from '@/utils/types';

export interface PackageManagerInfo {
    type: PackageManagerType;
    lockFiles: PackageManagerLockFile[];
}

export const PACKAGE_MANAGERS = {
    'npm': {
        type: 'npm',
        lockFiles: ['package-lock.json'],
    },
    'yarn': {
        type: 'yarn',
        lockFiles: ['yarn.lock'],
    },
    'pnpm': {
        type: 'pnpm',
        lockFiles: ['pnpm-lock.yaml'],
    },
    'bun': {
        type: 'bun',
        lockFiles: ['bun.lockb', 'bun.lock'],
    },
    'deno': {
        type: 'deno',
        lockFiles: ['deno.lock'],
    },
};

export const VALID_PACKAGE_MANAGERS = Object.keys(PACKAGE_MANAGERS) as PackageManagerType[];

export const LOCK_FILE_TO_PM_MAP = Object.values(PACKAGE_MANAGERS).reduce((acc, info) => {
    info.lockFiles.forEach(lockFile => {
        acc[lockFile] = info.type as PackageManagerType;
    });
    return acc;
}, {} as Record<PackageManagerLockFile, PackageManagerType>);