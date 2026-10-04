import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

export const LOCK_FILE = '.fnspm-operation.lock';
const ownership = new AsyncLocalStorage<ReadonlySet<string>>();

function acquire(root: string): () => void {
    const file = path.join(root, LOCK_FILE);
    let handle: number;
    try {
        handle = fs.openSync(file, 'wx', 0o600);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
            throw new Error(
                `Another FNSPM operation is running or was interrupted in ${root}. Inspect ${LOCK_FILE} with fnspm doctor before retrying.`,
            );
        throw error;
    }
    const identity = fs.fstatSync(handle, { bigint: true });
    const release = () => {
        try {
            // Never remove a lock another process substituted while we held ours.
            const current = fs.lstatSync(file, {
                bigint: true,
                throwIfNoEntry: false,
            });
            if (current?.dev === identity.dev && current.ino === identity.ino)
                fs.unlinkSync(file);
        } finally {
            fs.closeSync(handle);
        }
    };
    try {
        fs.writeFileSync(
            handle,
            JSON.stringify({
                pid: process.pid,
                startedAt: new Date().toISOString(),
            }) + '\n',
        );
    } catch (error) {
        release();
        throw error;
    }
    return release;
}

/** Synchronous mutations can reuse a lock held by their enclosing CLI operation. */
export function withOperationLock<T>(root: string, operation: () => T): T {
    root = fs.realpathSync(root);
    const owned = ownership.getStore() ?? new Set<string>();
    if (owned.has(root)) return operation();
    const release = acquire(root);
    try {
        return ownership.run(new Set([...owned, root]), operation);
    } finally {
        release();
    }
}

/** Acquire the complete workspace scope before restoring, executing, or migrating. */
export async function withOperationLocks<T>(
    roots: string[],
    operation: () => Promise<T>,
): Promise<T> {
    const owned = ownership.getStore() ?? new Set<string>();
    const scope = [
        ...new Set(roots.map((root) => fs.realpathSync(root))),
    ].sort();
    const releases: Array<() => void> = [];
    try {
        for (const root of scope)
            if (!owned.has(root)) releases.push(acquire(root));
        return await ownership.run(new Set([...owned, ...scope]), operation);
    } finally {
        for (const release of releases.reverse()) release();
    }
}
