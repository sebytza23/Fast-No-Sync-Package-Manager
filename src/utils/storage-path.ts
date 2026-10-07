import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import type { Config } from './types';
import type { ConfigDetails } from './config';

export const STORAGE_FILE = '.fnspm-storage.json';
export const RELOCATION_FILE = '.fnspm-relocate.json';

export function projectId(root: string): string {
    return createHash('sha256').update(fs.realpathSync(root)).digest('hex');
}

export function dataDirectory(): string {
    const override = process.env.FNSPM_DATA_DIR;
    if (override) {
        if (!path.isAbsolute(override))
            throw new Error('FNSPM_DATA_DIR must be absolute.');
        return path.resolve(override);
    }
    if (process.platform === 'win32')
        return path.join(
            process.env.LOCALAPPDATA ||
                path.join(os.homedir(), 'AppData', 'Local'),
            'fnspm',
        );
    if (process.platform === 'darwin')
        return path.join(
            os.homedir(),
            'Library',
            'Application Support',
            'fnspm',
        );
    const base = process.env.XDG_DATA_HOME;
    return path.join(
        base && path.isAbsolute(base)
            ? base
            : path.join(os.homedir(), '.local', 'share'),
        'fnspm',
    );
}

/** Resolve aliases through the existing ancestor, without creating directories. */
export function canonicalFuturePath(requested: string): string {
    const parts: string[] = [];
    let ancestor = path.resolve(requested);
    while (!fs.existsSync(ancestor)) {
        const parent = path.dirname(ancestor);
        if (parent === ancestor)
            throw new Error('No existing storage ancestor.');
        const stat = fs.lstatSync(ancestor, { throwIfNoEntry: false });
        if (stat)
            throw new Error('Storage ancestor is a broken link: ' + ancestor);
        parts.unshift(path.basename(ancestor));
        ancestor = parent;
    }
    if (!fs.statSync(ancestor).isDirectory())
        throw new Error('Storage parent must be a directory.');
    return path.join(fs.realpathSync(ancestor), ...parts);
}

export function automaticStorage(root: string): string {
    return path.join(
        canonicalFuturePath(dataDirectory()),
        'storage',
        projectId(root),
        'node_modules',
    );
}

export function existingAncestor(directory: string): string {
    while (!fs.existsSync(directory)) directory = path.dirname(directory);
    return directory;
}

/** Only create managed directories; verify their canonical location before use. */
export function ensureStorageParent(target: string): void {
    const parent = path.dirname(target);
    if (canonicalFuturePath(parent) !== parent)
        throw new Error('Storage parent changed; retry after inspection.');
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    if (fs.realpathSync(parent) !== parent)
        throw new Error('Storage parent changed while creating directories.');
}

export function readMetadata(file: string): unknown {
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat) return undefined;
    if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('Metadata must be a regular file: ' + file);
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
}

/** Flush a complete temporary file before replacing metadata at the same location. */
export function writeMetadata(
    file: string,
    value: unknown,
    exclusive = false,
): void {
    const current = fs.lstatSync(file, { throwIfNoEntry: false });
    if (exclusive && current)
        throw new Error('Metadata already exists: ' + file);
    if (current && (!current.isFile() || current.isSymbolicLink()))
        throw new Error('Metadata must be a regular file: ' + file);
    const temporary = file + '.tmp-' + randomUUID();
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
        fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
        fs.fsyncSync(fd);
    } catch (error) {
        fs.closeSync(fd);
        fs.unlinkSync(temporary);
        throw error;
    }
    fs.closeSync(fd);
    try {
        if (exclusive) {
            fs.linkSync(temporary, file);
            fs.unlinkSync(temporary);
        } else fs.renameSync(temporary, file);
    } catch (error) {
        fs.unlinkSync(temporary);
        throw error;
    }
}

export function storagePreference(root: string): string | undefined {
    const value = readMetadata(path.join(root, STORAGE_FILE)) as
        | { version?: unknown; root?: unknown; storagePath?: unknown }
        | undefined;
    if (value === undefined) return undefined;
    if (
        !value ||
        value.version !== 1 ||
        value.root !== root ||
        typeof value.storagePath !== 'string' ||
        (value.storagePath !== 'auto' && !path.isAbsolute(value.storagePath))
    )
        throw new Error('Invalid storage preference; inspect ' + STORAGE_FILE);
    return value.storagePath;
}

export function effectiveStorage(root: string, config: Config): Config {
    const preference = storagePreference(root);
    return preference === undefined
        ? config
        : {
              ...config,
              symlink: { ...config.symlink, storagePath: preference },
          };
}

export function storageConfigDetails(
    root: string,
    details: ConfigDetails,
): ConfigDetails {
    if (storagePreference(root) === undefined) return details;
    return {
        ...details,
        config: effectiveStorage(root, details.config),
        origins: {
            ...details.origins,
            'symlink.storagePath': path.join(root, STORAGE_FILE),
        },
    };
}

export function writeStoragePreference(
    root: string,
    storagePath: string | null,
): void {
    const file = path.join(root, STORAGE_FILE);
    if (storagePath === null) {
        readMetadata(file);
        if (fs.existsSync(file)) fs.unlinkSync(file);
    } else writeMetadata(file, { version: 1, root, storagePath });
}
