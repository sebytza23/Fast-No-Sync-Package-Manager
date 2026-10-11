import fs from 'node:fs';
import path from 'node:path';
import { prompt } from 'enquirer';
import { mergeConfig, validateConfig } from './config';
import { CONFIG_FILE_NAMES, readPackageJson } from './project';
import { VALID_PACKAGE_MANAGERS } from './package-managers';
import type { Config, DetectionMode, PackageManagerType } from './types';

export function processCliArgs(args: string[]): Config {
    const config = mergeConfig();
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const value = () => {
            const next = args[++i];
            if (!next || next.startsWith('-'))
                throw new Error(`Missing value for ${arg}`);
            return next;
        };
        const boolean = () => {
            if (args[i + 1] === 'true' || args[i + 1] === 'false')
                return args[++i] === 'true';
            return true;
        };
        switch (arg) {
            case '-d':
            case '--default':
                break;
            case '--pm':
                config.packageManager.default =
                    value().toLowerCase() as PackageManagerType;
                break;
            case '--detection':
                config.packageManager.detection =
                    value().toLowerCase() as DetectionMode;
                break;
            case '--symlink':
                config.symlink.enabled = boolean();
                break;
            case '--no-symlink':
            case '--no-sync-folder':
                config.symlink.enabled = false;
                break;
            case '--sync-folder':
                config.symlink.nosyncName = value();
                break;
            case '--storage-path':
                config.symlink.storagePath = value();
                break;
            case '--external':
                config.symlink.storagePath = 'auto';
                config.symlink.enabled = true;
                break;
            case '--add-to-gitignore':
                config.symlink.addToGitIgnore = boolean();
                break;
            case '--no-add-to-gitignore':
                config.symlink.addToGitIgnore = false;
                break;
            case '--verbose':
                config.debug.verbose = boolean();
                break;
            case '--no-verbose':
                config.debug.verbose = false;
                break;
            default:
                throw new Error(`Unknown initialization option: ${arg}`);
        }
    }
    validateConfig(config);
    return config;
}

export function createConfigFile(root: string, config: Config): string {
    validateConfig(config);
    if (
        CONFIG_FILE_NAMES.some((name) => fs.existsSync(path.join(root, name)))
    ) {
        throw new Error(
            'A FNSPM configuration already exists. Edit it instead of overwriting it.',
        );
    }
    const esm = readPackageJson(root).type === 'module';
    const file = path.join(root, `fnspm.config.${esm ? 'mjs' : 'cjs'}`);
    const content = `/** @type {import('fnspm').UserConfig} */\nconst config = ${JSON.stringify(config, null, 2)};\n\n${esm ? 'export default config;' : 'module.exports = config;'}\n`;
    fs.writeFileSync(file, content, { flag: 'wx' });
    return file;
}

export async function initialize(args: string[], root: string): Promise<void> {
    let config: Config;
    if (args.length) config = processCliArgs(args);
    else {
        if (!process.stdin.isTTY || !process.stdout.isTTY)
            throw new Error(
                'Interactive initialization requires a terminal; use initialize --default.',
            );
        const answers = await prompt<{
            manager: PackageManagerType;
            detection: DetectionMode;
            storage: 'external' | 'local' | 'native';
            nosyncName: string;
            gitignore: boolean;
            verbose: boolean;
        }>([
            {
                type: 'select',
                name: 'manager',
                message: 'Default package manager:',
                choices: VALID_PACKAGE_MANAGERS,
            },
            {
                type: 'select',
                name: 'detection',
                message: 'Detection mode:',
                choices: ['auto', 'default', ...VALID_PACKAGE_MANAGERS],
            },
            {
                type: 'select',
                name: 'storage',
                message: 'Where should dependencies live?',
                choices: [
                    { name: 'local', message: 'Project-local nosync folder' },
                    { name: 'external', message: 'Automatic external storage' },
                    { name: 'native', message: 'Keep native node_modules' },
                ],
            },
            {
                type: 'input',
                name: 'nosyncName',
                message: 'Nosync folder name:',
                initial: 'node_modules.nosync',
            },
            {
                type: 'confirm',
                name: 'gitignore',
                message: 'Add local dependency paths to .gitignore?',
                initial: true,
            },
            {
                type: 'confirm',
                name: 'verbose',
                message: 'Enable verbose logging?',
                initial: false,
            },
        ]);
        config = mergeConfig({
            packageManager: {
                default: answers.manager,
                detection: answers.detection,
            },
            symlink: {
                enabled: answers.storage !== 'native',
                ...(answers.storage === 'external'
                    ? { storagePath: 'auto' }
                    : {}),
                nosyncName: answers.nosyncName,
                addToGitIgnore: answers.gitignore,
            },
            debug: { verbose: answers.verbose },
        });
    }
    console.info(`Created configuration: ${createConfigFile(root, config)}`);
}
