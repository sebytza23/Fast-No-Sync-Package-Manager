import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_MANAGERS } from './package-managers';

export const CONFIG_FILE_NAMES = [
    'fnspm.config.cjs',
    'fnspm.config.mjs',
    'fnspm.config.js',
];
const rootMarkers = [
    'pnpm-workspace.yaml',
    'deno.json',
    'deno.jsonc',
    ...CONFIG_FILE_NAMES,
    ...Object.values(PACKAGE_MANAGERS).flatMap((manager) => [
        ...manager.lockFiles,
    ]),
];

export function readPackageJson(root: string): Record<string, unknown> {
    const file = path.join(root, 'package.json');
    if (!fs.existsSync(file)) return {};
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Expected an object in ${file}`);
    }
    return value as Record<string, unknown>;
}

/** Keep execution in the caller's directory; only discover configuration/dependency ownership. */
export function findProjectRoot(cwd = process.cwd()): string {
    let directory = path.resolve(cwd);
    let nearestPackage: string | undefined;
    while (true) {
        if (
            !nearestPackage &&
            fs.existsSync(path.join(directory, 'package.json'))
        )
            nearestPackage = directory;
        if (
            rootMarkers.some((file) =>
                fs.existsSync(path.join(directory, file)),
            )
        )
            return directory;
        if (readPackageJson(directory).workspaces) return directory;
        if (fs.existsSync(path.join(directory, '.git')))
            return nearestPackage ?? directory;
        const parent = path.dirname(directory);
        if (parent === directory) return nearestPackage ?? path.resolve(cwd);
        directory = parent;
    }
}

/** Migration ownership is independent from inherited project configuration. */
export function findMigrationRoot(cwd = process.cwd()): string {
    let directory = path.resolve(cwd);
    while (true) {
        if (fs.existsSync(path.join(directory, '.fnspm-state.json')))
            return directory;
        if (fs.existsSync(path.join(directory, '.git')))
            return path.resolve(cwd);
        const parent = path.dirname(directory);
        if (parent === directory) return path.resolve(cwd);
        directory = parent;
    }
}

/** Native installs in a workspace section can replace the shared dependency directory. */
export function findManagedWorkspaceRoots(cwd: string): string[] {
    return findWorkspaceRoots(cwd).filter((directory) =>
        fs.existsSync(path.join(directory, '.fnspm-state.json')),
    );
}

/** Include untracked shared workspace directories in native-operation locking. */
export function findWorkspaceRoots(cwd: string): string[] {
    const roots: string[] = [];
    let directory = path.resolve(cwd);
    while (!fs.existsSync(path.join(directory, '.git'))) {
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
        if (
            fs.existsSync(path.join(directory, 'pnpm-workspace.yaml')) ||
            readPackageJson(directory).workspaces
        )
            roots.push(directory);
    }
    return roots;
}

/** The nearest configuration applies to nested sections until another config or Git boundary. */
export function findConfigRoot(start: string): string {
    let directory = path.resolve(start);
    while (true) {
        if (
            CONFIG_FILE_NAMES.some((name) =>
                fs.existsSync(path.join(directory, name)),
            )
        )
            return directory;
        if (fs.existsSync(path.join(directory, '.git')))
            return path.resolve(start);
        const parent = path.dirname(directory);
        if (parent === directory) return path.resolve(start);
        directory = parent;
    }
}
