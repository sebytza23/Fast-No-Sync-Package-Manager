import { isPackageManager } from './package-managers';
import type { PackageManagerType } from './types';

export function parseRunArgs(args: string[]): {
    manager?: PackageManagerType;
    debug: boolean;
    args: string[];
} {
    let manager: PackageManagerType | undefined;
    let debug = false;
    const forwarded: string[] = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--') {
            forwarded.push(...args.slice(i));
            break;
        }
        if (arg === '--pm' || arg.startsWith('--pm=')) {
            const value = (
                arg === '--pm' ? args[++i] : arg.slice(5)
            )?.toLowerCase();
            if (!isPackageManager(value))
                throw new Error('Use --pm with npm, yarn, pnpm, bun, or deno.');
            if (manager) throw new Error('--pm may only be specified once.');
            manager = value;
        } else if (arg === '--debug') debug = true;
        else forwarded.push(arg);
    }
    if (!forwarded.length || forwarded[0] === '--')
        throw new Error('No package manager command provided.');
    return { manager, debug, args: forwarded };
}

/** Preserve automatic conversion after native commands, scoped to the caller's local dependencies. */
export function shouldAutoMigrate(args: string[]): boolean {
    const ownArgs = args.slice(
        0,
        args.indexOf('--') < 0 ? args.length : args.indexOf('--'),
    );
    return !ownArgs.some(
        (arg) =>
            /^(--global|--(prefix|cwd|dir|directory|dry-run|help|version))($|=)/.test(
                arg,
            ) ||
            /^-C/.test(arg) ||
            /^-[^-]*g/.test(arg) ||
            ['-h', '-v'].includes(arg),
    );
}

export function isDependencyCommand(
    args: string[],
    manager?: PackageManagerType,
): boolean {
    // Native managers accept options before the command. Skip their values so
    // `--filter web install` and `--workspace web ci` still restore tracked storage.
    const valueOptions = new Set([
        '--filter',
        '--filter-prod',
        '-F',
        '--workspace',
        '--scope',
        '--registry',
        '--cache',
        '--config',
        '-c',
        '--loglevel',
        '--location',
        '--userconfig',
        '--globalconfig',
        '--store-dir',
        '--modules-folder',
    ]);
    if (manager === 'npm') valueOptions.add('-w');
    let command: string | undefined;
    for (let i = 0; i < args.length && args[i] !== '--'; i++) {
        const arg = args[i];
        if (valueOptions.has(arg)) {
            i++;
            continue;
        }
        if (arg.startsWith('-')) continue;
        if (manager === 'pnpm' && ['recursive', 'multi', 'm'].includes(arg))
            continue;
        if (manager === 'yarn' && arg === 'workspace') {
            i++;
            continue;
        }
        command = arg;
        break;
    }
    return (
        [
            'install',
            'i',
            'add',
            'ci',
            'remove',
            'rm',
            'uninstall',
            'update',
            'up',
            'upgrade',
            'clean-install',
            'install-test',
            'it',
            'un',
            'uni',
            'rebuild',
            'rb',
            'prune',
            'dedupe',
        ].includes(command ?? '') && shouldAutoMigrate(args)
    );
}
