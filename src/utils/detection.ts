import fs from 'node:fs';
import path from 'node:path';
import {
    isPackageManager,
    PACKAGE_MANAGERS,
    type PackageManagerType,
} from './package-managers';
import { readPackageJson } from './project';
import type { Config } from './types';

export function lockfileManagers(root: string): PackageManagerType[] {
    return (Object.keys(PACKAGE_MANAGERS) as PackageManagerType[]).filter(
        (manager) =>
            PACKAGE_MANAGERS[manager].lockFiles.some((file) =>
                fs.existsSync(path.join(root, file)),
            ),
    );
}

export function detectPackageManager(
    root: string,
    config: Config,
): PackageManagerType {
    return describePackageManager(root, config).name;
}

export function describePackageManager(
    root: string,
    config: Config,
    override?: PackageManagerType,
): { name: PackageManagerType; reason: string } {
    if (override) return { name: override, reason: 'CLI --pm override' };
    const { detection, default: fallback } = config.packageManager;
    if (detection === 'default')
        return {
            name: fallback,
            reason: 'configured packageManager.default (detection: default)',
        };
    if (detection !== 'auto')
        return {
            name: detection,
            reason: 'configured packageManager.detection',
        };
    const declared = readPackageJson(root).packageManager;
    if (declared !== undefined) {
        if (typeof declared !== 'string')
            throw new Error('package.json#packageManager must be a string');
        const manager = declared.split('@')[0];
        if (!isPackageManager(manager))
            throw new Error(
                `Unsupported packageManager: ${declared}; use --pm to override.`,
            );
        return {
            name: manager,
            reason: `package.json#packageManager: ${declared}`,
        };
    }
    const candidates = lockfileManagers(root);
    if (candidates.length > 1)
        throw new Error(
            `Multiple package managers detected (${candidates.join(', ')}); set package.json#packageManager or use --pm.`,
        );
    if (candidates[0])
        return { name: candidates[0], reason: 'project lockfile' };
    if (
        fs.existsSync(path.join(root, 'deno.json')) ||
        fs.existsSync(path.join(root, 'deno.jsonc'))
    )
        return { name: 'deno', reason: 'Deno configuration' };
    return {
        name: fallback,
        reason: 'configured fallback (no manifest manager or lockfile)',
    };
}
