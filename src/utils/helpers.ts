import fs from "fs";
import path from "path";
import { PackageManagerType } from "./types";

export const findPackageManagerLockFile = (): PackageManagerType => {
    const lockFileMap = {
        'package-lock.json': 'npm',
        'pnpm-lock.yaml': 'pnpm',
        'yarn.lock': 'yarn',
        'bun.lockb': 'bun',
        'deno.lock': 'deno'
    } as const;

    for (const [lockFile, pmType] of Object.entries(lockFileMap)) {
        if (fs.existsSync(path.join(process.cwd(), lockFile))) {
            return pmType as PackageManagerType;
        }
    }
    
    return 'invalid';
};

export const createSymlink = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        try {
            const nodeModulesPath = path.join(process.cwd(), 'node_modules');
            const nodeModulesNoSyncPath = path.join(process.cwd(), 'node_modules.nosync');

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
};

export const shouldCreateSymlink = (): boolean => {
    return !fs.lstatSync(path.join(process.cwd(), 'node_modules')).isSymbolicLink();
};

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
