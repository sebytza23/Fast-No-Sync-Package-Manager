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

export function isDependencyCommand(args: string[]): boolean {
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
        ].includes(args[0]) && shouldAutoMigrate(args)
    );
}
