import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './types';
import { LOCK_FILE, withOperationLock } from './operation-lock';
export { LOCK_FILE } from './operation-lock';

export const STATE_FILE = '.fnspm-state.json';
interface MigrationState {
    version: 1;
    root: string;
    target: string;
    device: string;
    inode: string;
}

export function lstat(file: string): fs.Stats | undefined {
    try {
        return fs.lstatSync(file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return undefined;
        throw error;
    }
}
const inside = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return (
        relative === '' ||
        (!relative.startsWith(`..${path.sep}`) &&
            relative !== '..' &&
            !path.isAbsolute(relative))
    );
};

export function dependencyTarget(root: string, config: Config): string {
    root = fs.realpathSync(root);
    const requested =
        config.symlink.storagePath ??
        path.join(root, config.symlink.nosyncName);
    const parent = fs.realpathSync(path.dirname(requested));
    const target = path.join(parent, path.basename(requested));
    const source = path.join(root, 'node_modules');
    if (
        inside(target, root) ||
        inside(source, target) ||
        (inside(root, target) &&
            target !== path.join(root, config.symlink.nosyncName))
    ) {
        throw new Error(
            'Dependency storage must be the configured nosync directory or a dedicated directory outside the project.',
        );
    }
    return target;
}

/** Moving the directory must not change where workspace or linked-package symlinks resolve. */
function checkRelativeLinks(
    source: string,
    target: string,
    directory = source,
    sourceRemainsLinked = true,
): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
            const link = fs.readlinkSync(file);
            if (path.isAbsolute(link)) {
                if (!sourceRemainsLinked && inside(source, link)) {
                    throw new Error(
                        `Restoring dependencies would break the absolute link ${file}. Replace it with a relative link first.`,
                    );
                }
                continue; // During migration the original node_modules path remains a link to storage.
            }
            const before = path.resolve(path.dirname(file), link);
            const after = path.resolve(
                path.dirname(path.join(target, path.relative(source, file))),
                link,
            );
            const expected = inside(source, before)
                ? path.join(target, path.relative(source, before))
                : before;
            if (after !== expected)
                throw new Error(
                    `Moving dependencies would break the relative link ${file}. Use project-local storage for workspace/linked dependencies.`,
                );
        } else if (entry.isDirectory())
            checkRelativeLinks(source, target, file, sourceRemainsLinked);
    }
}

function readState(root: string): MigrationState | undefined {
    const file = path.join(root, STATE_FILE);
    const stats = lstat(file);
    if (!stats) return undefined;
    if (!stats.isFile() || stats.isSymbolicLink())
        throw new Error('Migration state must be a regular file.');
    const state = JSON.parse(fs.readFileSync(file, 'utf8')) as MigrationState;
    if (
        !state ||
        typeof state !== 'object' ||
        state.version !== 1 ||
        state.root !== root ||
        typeof state.target !== 'string' ||
        !path.isAbsolute(state.target) ||
        typeof state.device !== 'string' ||
        !/^\d+$/.test(state.device) ||
        typeof state.inode !== 'string' ||
        !/^\d+$/.test(state.inode) ||
        inside(state.target, root) ||
        inside(path.join(root, 'node_modules'), state.target)
    ) {
        throw new Error(
            'Invalid migration state; inspect it before attempting recovery.',
        );
    }
    return state;
}

// Windows file IDs can exceed Number.MAX_SAFE_INTEGER; keep identities lossless.
function identity(file: string): Pick<MigrationState, 'device' | 'inode'> {
    const stats = fs.lstatSync(file, { bigint: true });
    return { device: stats.dev.toString(), inode: stats.ino.toString() };
}

function matchesIdentity(file: string, state: MigrationState): boolean {
    const current = identity(file);
    return current.device === state.device && current.inode === state.inode;
}

function ownedTarget(state: MigrationState): boolean {
    const stats = lstat(state.target);
    return (
        !!stats?.isDirectory() &&
        !stats.isSymbolicLink() &&
        matchesIdentity(state.target, state)
    );
}

function linkTarget(source: string): string {
    return path.resolve(path.dirname(source), fs.readlinkSync(source));
}

function createLink(source: string, target: string): void {
    // Relative links survive moving a project on POSIX; junctions require an absolute target.
    fs.symlinkSync(
        process.platform === 'win32'
            ? target
            : path.relative(path.dirname(source), target),
        source,
        process.platform === 'win32' ? 'junction' : 'dir',
    );
}

function withLock<T>(root: string, operation: () => T): T {
    return withOperationLock(root, operation);
}

export function gitIgnoreRules(root: string, config: Config): string[] {
    const target = config.symlink.storagePath;
    const localStorage =
        !target ||
        (fs.existsSync(path.dirname(target)) &&
            fs.realpathSync(path.dirname(target)) === fs.realpathSync(root) &&
            path.basename(target) === config.symlink.nosyncName);
    return [
        '/node_modules',
        ...(localStorage
            ? [`/${config.symlink.nosyncName.replace(/[\[\]]/g, '\\$&')}/`]
            : []),
        `/${STATE_FILE}`,
        `/${LOCK_FILE}`,
    ];
}

export function addToGitIgnore(
    root: string,
    config: Config,
    dryRun = false,
): string[] {
    const file = path.join(root, '.gitignore');
    const stats = lstat(file);
    if (stats && (!stats.isFile() || stats.isSymbolicLink()))
        throw new Error('.gitignore must be a regular file.');
    const content = stats ? fs.readFileSync(file, 'utf8') : '';
    const lines = new Set(content.split(/\r?\n/).map((line) => line.trim()));
    const missing = gitIgnoreRules(root, config).filter(
        (rule) => !lines.has(rule),
    );
    if (!missing.length || dryRun) return missing;
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    fs.appendFileSync(
        file,
        `${content && !content.endsWith('\n') ? newline : ''}${newline}# FNSPM local dependencies${newline}${missing.join(newline)}${newline}`,
    );
    return missing;
}

/** Only repair entries whose ownership and directory identity are still provable. */
export function repairDependencies(
    root: string,
    dryRun = false,
): string | undefined {
    root = fs.realpathSync(root);
    const state = readState(root);
    if (!state) return undefined;
    const source = path.join(root, 'node_modules');
    const stats = lstat(source);
    if (!stats && ownedTarget(state)) {
        const message = `Recover recorded link: ${source} -> ${state.target}`;
        if (dryRun) return `[dry-run] ${message}`;
        return withLock(root, () => {
            // Validate ownership again under the mutation lock.
            const current = readState(root);
            if (
                !current ||
                current.target !== state.target ||
                !ownedTarget(current) ||
                lstat(source)
            )
                throw new Error(
                    'Storage changed while preparing recovery; inspect with fnspm doctor.',
                );
            createLink(source, current.target);
            return message;
        });
    }
    const restorePlan = restoreDependencies(root, true);
    if (stats?.isDirectory() && !lstat(state.target))
        return dryRun ? restorePlan : restoreDependencies(root);
    return undefined;
}

export function migrateDependencies(
    root: string,
    config: Config,
    dryRun = false,
): string {
    root = fs.realpathSync(root);
    const source = path.join(root, 'node_modules');
    const target = dependencyTarget(root, config);
    const inspect = (): {
        state?: MigrationState;
        stats?: fs.Stats;
        recovery?: boolean;
    } => {
        const state = readState(root);
        const stats = lstat(source);
        if (state && state.target !== target)
            throw new Error(
                'Storage configuration changed; run fnspm restore before migrating to a new target.',
            );
        if (stats?.isSymbolicLink()) {
            if (linkTarget(source) !== target)
                throw new Error(
                    'node_modules points to another directory; refusing to move a foreign symlink.',
                );
            if (!fs.existsSync(source))
                throw new Error(
                    'node_modules is a broken symlink. Restore its target before continuing.',
                );
            if (!fs.statSync(source).isDirectory())
                throw new Error(
                    'node_modules link does not point to a directory.',
                );
            if (state && !ownedTarget(state))
                throw new Error(
                    'Dependency storage was replaced; refusing to modify it.',
                );
            return { state, stats };
        }
        if (state && !stats && ownedTarget(state))
            return { state, recovery: true };
        if (
            state &&
            (!stats?.isDirectory() || !matchesIdentity(source, state))
        ) {
            throw new Error(
                'Interrupted or inconsistent migration; inspect the project with fnspm doctor.',
            );
        }
        if (!stats) return {};
        if (!stats.isDirectory())
            throw new Error('node_modules must be a directory.');
        if (lstat(target))
            throw new Error(
                `Destination already exists: ${target}. No files were overwritten.`,
            );
        if (fs.statSync(path.dirname(target)).dev !== stats.dev)
            throw new Error(
                'Dependency storage must be on the same filesystem so migration can be rolled back safely.',
            );
        checkRelativeLinks(source, target);
        return { state, stats };
    };
    const plan = inspect();
    if (plan.stats?.isSymbolicLink()) {
        if (plan.state || target !== path.join(root, config.symlink.nosyncName))
            return `Already linked: ${source} -> ${target}`;
        const targetStats = lstat(target);
        if (!targetStats?.isDirectory() || targetStats.isSymbolicLink())
            throw new Error(
                'Existing nosync target must be a regular directory to track it.',
            );
        const message = `Track existing nosync link: ${source} -> ${target}`;
        if (dryRun) return `[dry-run] ${message}`;
        return withLock(root, () => {
            const current = inspect();
            if (!current.stats?.isSymbolicLink())
                throw new Error(
                    'Dependencies changed while tracking the existing link; retry.',
                );
            if (current.state) return `Already linked: ${source} -> ${target}`;
            if (config.symlink.addToGitIgnore) addToGitIgnore(root, config);
            fs.writeFileSync(
                path.join(root, STATE_FILE),
                JSON.stringify(
                    { version: 1, root, target, ...identity(target) },
                    null,
                    2,
                ) + '\n',
                { flag: 'wx', mode: 0o600 },
            );
            return message;
        });
    }
    if (!plan.stats && !plan.recovery)
        return 'No node_modules directory to migrate (expected for Yarn PnP and cache-only Deno projects).';
    const message = `${plan.recovery ? 'Recover link' : 'Move dependencies'}: ${source} -> ${target}`;
    if (dryRun) return `[dry-run] ${message}`;
    return withLock(root, () => {
        const current = inspect();
        if (config.symlink.addToGitIgnore) addToGitIgnore(root, config);
        if (current.recovery) {
            createLink(source, target);
            return message;
        }
        if (!current.stats || current.stats.isSymbolicLink())
            throw new Error(
                'Dependencies changed while preparing migration; retry.',
            );
        const state: MigrationState = current.state ?? {
            version: 1,
            root,
            target,
            ...identity(source),
        };
        const stateFile = path.join(root, STATE_FILE);
        if (!current.state)
            fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', {
                flag: 'wx',
                mode: 0o600,
            });
        let moved = false;
        try {
            fs.renameSync(source, target);
            moved = true;
            createLink(source, target);
        } catch (error) {
            if (moved) {
                // Never delete a new entry another process created at the source path.
                if (lstat(source))
                    throw new Error(
                        `Migration failed and node_modules was recreated. Data remains at ${target}; inspect with fnspm doctor.`,
                        { cause: error },
                    );
                fs.renameSync(target, source);
            }
            fs.unlinkSync(stateFile);
            throw error;
        }
        return message;
    });
}

export function restoreDependencies(root: string, dryRun = false): string {
    root = fs.realpathSync(root);
    const source = path.join(root, 'node_modules');
    const inspect = () => {
        const state = readState(root);
        if (!state)
            throw new Error(
                'No FNSPM migration state found; refusing to move an untracked directory.',
            );
        const stats = lstat(source);
        if (
            stats &&
            (!stats.isSymbolicLink() || linkTarget(source) !== state.target)
        ) {
            // Handles a crash after restoration moved the data but before state cleanup.
            if (
                stats.isDirectory() &&
                matchesIdentity(source, state) &&
                !lstat(state.target)
            ) {
                return { state, restored: true, linked: false };
            }
            throw new Error(
                'node_modules was replaced; refusing to overwrite it.',
            );
        }
        if (!ownedTarget(state))
            throw new Error(
                'Dependency storage is missing or was replaced; refusing restoration.',
            );
        checkRelativeLinks(state.target, source, state.target, false);
        return { state, restored: false, linked: !!stats };
    };
    const plan = inspect();
    const message = plan.restored
        ? 'Dependencies already restored; remove migration state.'
        : `Restore dependencies: ${plan.state.target} -> ${source}`;
    if (dryRun) return `[dry-run] ${message}`;
    return withLock(root, () => {
        const current = inspect();
        if (!current.restored) {
            if (current.linked) fs.unlinkSync(source);
            try {
                fs.renameSync(current.state.target, source);
            } catch (error) {
                if (current.linked && !lstat(source))
                    createLink(source, current.state.target);
                throw error;
            }
        }
        fs.unlinkSync(path.join(root, STATE_FILE));
        return message;
    });
}
