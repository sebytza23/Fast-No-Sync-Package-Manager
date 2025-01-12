import fs from "fs";
import path from "path";
import { Config, PackageManagerType } from "./types";
import { VALID_PACKAGE_MANAGERS } from "@/packages/factory";
import { defaultConfig } from '@/config/fnspm.config';

const CONFIG_FILE_NAMES = [
    'fnspm.config.js',
    'fnspm.config.mjs',
    'fnspm.config.cjs',
];

export const loadConfig = async () => {
    let config = defaultConfig;

    // Găsește primul fișier de configurare valid
    const configFile = CONFIG_FILE_NAMES
        .map(name => path.join(process.cwd(), name))
        .find(file => fs.existsSync(file));

    if (configFile) {
        try {
            let userConfig: Config;
            
            if (configFile.endsWith('.mjs')) {
                // ES Module
                userConfig = await import(configFile).then(m => m.default || m);
            } else {
                // CommonJS or .js
                try {
                    // Try ESM first
                    userConfig = await import(configFile).then(m => m.default || m);
                } catch {
                    // If it fails, use require for CommonJS
                    userConfig = require(configFile);
                }
            } 

            config = MergeConfigurations(defaultConfig, userConfig);
        } catch (error) {
            console.warn(`Could not load config from ${configFile}:`, error);
        }
    }

    validateConfig(config);
    return config;
};

const MergeConfigurations = (defaultConfig: Config, userConfig: Config): Config => {
    return {
        ...defaultConfig,
        ...userConfig,
        packageManager: {
            ...defaultConfig.packageManager,
            ...userConfig.packageManager
        },
        symlink: {
            ...defaultConfig.symlink,
            ...userConfig.symlink
        },
        debug: {
            ...defaultConfig.debug,
            ...userConfig.debug
        }
    };
}

function validateConfig(config: Config): void {
    if (!VALID_PACKAGE_MANAGERS.includes(config.packageManager.default)) {
        throw new Error(`Invalid default package manager: ${config.packageManager.default}`);
    }
    if (['auto', 'default'].includes(config.packageManager.detection) && !VALID_PACKAGE_MANAGERS.includes(config.packageManager.default)) {
        throw new Error(`Default package manager is required if detection mode is ${config.packageManager.detection}`);
    }
    if (!['auto', 'default', ...VALID_PACKAGE_MANAGERS].includes(config.packageManager.detection)) {
        throw new Error(`Invalid detection mode: ${config.packageManager.detection}`);
    }
    if (config.symlink.enabled && !config.symlink.nosyncName) {
        throw new Error(`Invalid symlink config: nosyncName is required`);
    }
    if (config.symlink.enabled && !config.symlink.enabled) {
        throw new Error(`Invalid symlink config: enabled is required`);
    }
    if (config.debug.verbose && typeof config.debug.verbose !== 'boolean') {
        throw new Error(`Invalid debug config: verbose must be a boolean`);
    }
    if (config.debug.verbose && typeof config.debug.verbose !== 'boolean') {
        throw new Error(`Invalid debug config: verbose must be a boolean`);
    }
    if (config.symlink.enabled && !config.symlink.enabled) {
        throw new Error(`Invalid symlink config: enabled is required`);
    }
}

export const findPackageManagerLockFile = async (): Promise<PackageManagerType> => {
    const config = await loadConfig();
    const defaultPm = config.packageManager.default;
    const detection = config.packageManager.detection;
    const lockFileMap = {
        'package-lock.json': 'npm',
        'pnpm-lock.yaml': 'pnpm',
        'yarn.lock': 'yarn',
        'bun.lockb': 'bun',
        'deno.lock': 'deno'
    } as const;

    if (config.debug.verbose) {
        console.info(`Detection Mode: ${detection}`);
        console.info(`Default Package Manager: ${defaultPm}`);
    }

    if (detection === 'auto') {
        for (const [lockFile, pmType] of Object.entries(lockFileMap)) {
            if (fs.existsSync(path.join(process.cwd(), lockFile))) {
                console.info(`No package manager specified, using "${pmType}" based on lock file`);
                return pmType ;
            }
        }
    
        console.info(`No lock file found, using default package manager "${defaultPm}"`);
        return defaultPm;
    }

    if (detection === 'default') {
        console.info(`Using default package manager "${defaultPm}" from config`);
        return defaultPm;
    }

    console.info(`Using configured package manager "${detection}" from config`);
    return detection;    
};

export async function shouldCreateSymlink(): Promise<boolean> {
    const config = await loadConfig();
    if (config.symlink.enabled) {
        if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
            return false;
        }
        
        return !fs.lstatSync(path.join(process.cwd(), 'node_modules')).isSymbolicLink();
    }

    return false;
}

export async function createSymlink(): Promise<void> {
    const config = await loadConfig();
    const nosyncName = config.symlink.nosyncName;
    
    return new Promise((resolve, reject) => {
        try {
            const nodeModulesPath = path.join(process.cwd(), 'node_modules');
            const nodeModulesNoSyncPath = path.join(process.cwd(), nosyncName);

            if (fs.existsSync(nodeModulesPath)) {
                if (fs.existsSync(nodeModulesNoSyncPath)) {
                    fs.rmSync(nodeModulesNoSyncPath, { recursive: true });
                }
                fs.renameSync(nodeModulesPath, nodeModulesNoSyncPath);
                fs.symlinkSync(nodeModulesNoSyncPath, nodeModulesPath, 'junction');
            }
            
            resolve();
        } catch (fsError) {
            console.error('Error handling node_modules:', fsError);
            resolve();
        }
    });
}

export const AddToGitIgnore = (): void => {
    const gitIgnorePath = path.join(process.cwd(), '.gitignore');
    const gitIgnoreContent = fs.readFileSync(gitIgnorePath, 'utf8');
    const gitIgnoreContentArray = gitIgnoreContent.split('\n');

    if (!gitIgnoreContentArray.some((value) => value === "node_modules")) {
        fs.appendFileSync(gitIgnorePath, '\n# Symlink is not a directory');
        fs.appendFileSync(gitIgnorePath, '\nnode_modules');
        fs.appendFileSync(gitIgnorePath, '\nnode_modules.nosync/');
    }
};

export { PackageManagerType };
