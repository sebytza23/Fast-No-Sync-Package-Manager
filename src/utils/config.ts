import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultConfig } from '../config/fnspm.config';
import { isPackageManager } from './package-managers';
import { CONFIG_FILE_NAMES, findProjectRoot, findConfigRoot } from './project';
import type { Config, UserConfig } from './types';

const settings: Record<string, readonly string[]> = {
    packageManager: ['default', 'detection'],
    symlink: ['enabled', 'addToGitIgnore', 'nosyncName', 'storagePath'],
    debug: ['verbose'],
};

export interface ConfigDetails {
    config: Config;
    file: string | null;
    origins: Record<string, string>;
}

function details(
    config: Config,
    user: UserConfig = {},
    file: string | null = null,
): ConfigDetails {
    const origins: Record<string, string> = {};
    for (const [section, keys] of Object.entries(settings)) {
        const values = user[section as keyof UserConfig] as
            Record<string, unknown> | undefined;
        for (const key of keys)
            origins[`${section}.${key}`] =
                file && values?.[key] !== undefined ? file : 'built-in default';
    }
    return { config, file, origins };
}

export function mergeConfig(user: UserConfig = {}): Config {
    return {
        packageManager: {
            ...defaultConfig.packageManager,
            ...user.packageManager,
        },
        symlink: { ...defaultConfig.symlink, ...user.symlink },
        debug: { ...defaultConfig.debug, ...user.debug },
    };
}

export function validateConfig(config: Config): void {
    if (!isPackageManager(config.packageManager.default))
        throw new Error('Invalid packageManager.default');
    if (
        !['auto', 'default'].includes(config.packageManager.detection) &&
        !isPackageManager(config.packageManager.detection)
    ) {
        throw new Error('Invalid packageManager.detection');
    }
    for (const [name, value] of Object.entries({
        'symlink.enabled': config.symlink.enabled,
        'symlink.addToGitIgnore': config.symlink.addToGitIgnore,
        'debug.verbose': config.debug.verbose,
    })) {
        if (typeof value !== 'boolean')
            throw new Error(`${name} must be a boolean`);
    }
    const name = config.symlink.nosyncName;
    if (
        typeof name !== 'string' ||
        !name.trim() ||
        /[\x00-\x1f\x7f/\\<>:"|?*]/.test(name) ||
        /[. ]$/.test(name) ||
        [
            '.',
            '..',
            'node_modules',
            '.git',
            '.fnspm-state.json',
            '.fnspm-operation.lock',
            '.fnspm-storage.json',
            '.fnspm-relocate.json',
        ].includes(name.toLowerCase()) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    ) {
        throw new Error(
            'symlink.nosyncName must be a safe directory name other than node_modules',
        );
    }
    if (
        config.symlink.storagePath !== undefined &&
        config.symlink.storagePath !== 'auto' &&
        (typeof config.symlink.storagePath !== 'string' ||
            !path.isAbsolute(config.symlink.storagePath) ||
            config.symlink.storagePath.includes('\0'))
    ) {
        throw new Error('symlink.storagePath must be an absolute path or auto');
    }
}

export async function loadConfigDetails(
    root = findProjectRoot(),
): Promise<ConfigDetails> {
    root = findConfigRoot(root);
    const files = CONFIG_FILE_NAMES.map((name) => path.join(root, name)).filter(
        (file) => fs.existsSync(file),
    );
    if (files.length > 1)
        throw new Error('Multiple FNSPM config files found; keep only one.');
    if (!files.length) return details(mergeConfig());
    const file = files[0];
    try {
        // NodeNext preserves native import() in CommonJS, including .mjs and ESM .js configs.
        const namespace = await import(pathToFileURL(file).href);
        const user: unknown = namespace.default;
        if (!user || typeof user !== 'object' || Array.isArray(user))
            throw new Error('Config must export an object');
        for (const [key, value] of Object.entries(user)) {
            if (!Object.hasOwn(settings, key))
                throw new Error(`Unknown config section: ${key}`);
            if (!value || typeof value !== 'object' || Array.isArray(value))
                throw new Error(`${key} must be an object`);
            for (const setting of Object.keys(value)) {
                if (!settings[key].includes(setting))
                    throw new Error(`Unknown setting: ${key}.${setting}`);
            }
        }
        const config = mergeConfig(user as UserConfig);
        validateConfig(config);
        return details(config, user as UserConfig, file);
    } catch (error) {
        throw new Error(
            `Could not load ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

export async function loadConfig(root = findProjectRoot()): Promise<Config> {
    return (await loadConfigDetails(root)).config;
}
