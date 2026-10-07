import fs from 'node:fs';
import path from 'node:path';
import {
    dataDirectory,
    canonicalFuturePath,
    ensureStorageParent,
    projectId,
    readMetadata,
    writeMetadata,
    RELOCATION_FILE,
} from './storage-path';

export interface StorageRecord {
    version: 1;
    root: string;
    target: string;
    device: string;
    inode: string;
    projectDevice: string;
    projectInode: string;
    lastSeen: string;
}

export function registryDirectory(): string {
    return path.join(canonicalFuturePath(dataDirectory()), 'registry');
}

export function recordStorage(
    root: string,
    state: { root: string; target: string; device: string; inode: string },
    strict = false,
): void {
    try {
        const stats = fs.lstatSync(root, { bigint: true });
        const file = path.join(registryDirectory(), projectId(root) + '.json');
        ensureStorageParent(file);
        writeMetadata(file, {
            version: 1,
            ...state,
            projectDevice: stats.dev.toString(),
            projectInode: stats.ino.toString(),
            lastSeen: new Date().toISOString(),
        } satisfies StorageRecord);
    } catch (error) {
        if (strict) throw error;
        console.error(
            'FNSPM storage inventory could not be updated: ' + String(error),
        );
    }
}

function validateRecord(value: unknown): StorageRecord {
    const record = value as StorageRecord;
    if (
        !record ||
        record.version !== 1 ||
        typeof record.root !== 'string' ||
        !path.isAbsolute(record.root) ||
        typeof record.target !== 'string' ||
        !path.isAbsolute(record.target) ||
        ![
            record.device,
            record.inode,
            record.projectDevice,
            record.projectInode,
        ].every((value) => typeof value === 'string' && /^\d+$/.test(value)) ||
        typeof record.lastSeen !== 'string' ||
        !Number.isFinite(Date.parse(record.lastSeen))
    )
        throw new Error('Invalid inventory record.');
    return record;
}

export function listStorage() {
    const directory = registryDirectory();
    const entries: Array<{
        record: StorageRecord | null;
        file: string;
        status:
            | 'managed'
            | 'recovery-needed'
            | 'unavailable'
            | 'changed'
            | 'untracked'
            | 'restored'
            | 'invalid';
        message?: string;
    }> = [];
    if (!fs.existsSync(directory))
        return { schemaVersion: 1, registry: directory, entries };
    for (const name of fs.readdirSync(directory).sort()) {
        if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
        const file = path.join(directory, name);
        let record: StorageRecord | null = null;
        try {
            record = validateRecord(readMetadata(file));
            const root = fs.lstatSync(record.root, {
                bigint: true,
                throwIfNoEntry: false,
            });
            if (!root) {
                entries.push({
                    record,
                    file,
                    status: 'unavailable',
                    message:
                        'Project path unavailable; this does not establish that storage is unused.',
                });
                continue;
            }
            if (
                !root.isDirectory() ||
                root.isSymbolicLink() ||
                root.dev.toString() !== record.projectDevice ||
                root.ino.toString() !== record.projectInode ||
                projectId(record.root) + '.json' !== name
            ) {
                entries.push({
                    record,
                    file,
                    status: 'changed',
                    message: 'Project identity changed.',
                });
                continue;
            }
            const target = fs.lstatSync(record.target, {
                bigint: true,
                throwIfNoEntry: false,
            });
            const state = readMetadata(
                path.join(record.root, '.fnspm-state.json'),
            ) as
                | {
                      version?: unknown;
                      root?: unknown;
                      target?: unknown;
                      device?: unknown;
                      inode?: unknown;
                  }
                | undefined;
            if (state === undefined) {
                entries.push({
                    record,
                    file,
                    status: target ? 'untracked' : 'restored',
                });
                continue;
            }
            if (!state || typeof state !== 'object' || Array.isArray(state))
                throw new Error('Invalid migration state: ' + record.root);
            if (
                fs.lstatSync(path.join(record.root, RELOCATION_FILE), {
                    throwIfNoEntry: false,
                })
            ) {
                entries.push({ record, file, status: 'recovery-needed' });
                continue;
            }
            if (
                state.version !== 1 ||
                state.root !== record.root ||
                state.target !== record.target ||
                state.device !== record.device ||
                state.inode !== record.inode ||
                !target?.isDirectory() ||
                target.isSymbolicLink() ||
                target.dev.toString() !== record.device ||
                target.ino.toString() !== record.inode
            ) {
                entries.push({
                    record,
                    file,
                    status: 'changed',
                    message: 'Storage or ownership state changed.',
                });
                continue;
            }
            const source = path.join(record.root, 'node_modules');
            const link = fs.lstatSync(source, { throwIfNoEntry: false });
            const status = !link
                ? 'recovery-needed'
                : link.isSymbolicLink() &&
                    path.resolve(record.root, fs.readlinkSync(source)) ===
                        record.target
                  ? 'managed'
                  : 'changed';
            entries.push({ record, file, status });
        } catch (error) {
            entries.push({
                record,
                file,
                status: 'invalid',
                message: String(error),
            });
        }
    }
    return { schemaVersion: 1, registry: directory, entries };
}
