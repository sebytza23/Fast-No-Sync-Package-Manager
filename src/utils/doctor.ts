import fs from 'node:fs';
import path from 'node:path';
import spawn from 'cross-spawn';
import {
    dependencyTarget,
    gitIgnoreRules,
    lstat,
    LOCK_FILE,
    STATE_FILE,
    restoreDependencies,
} from './dependencies';
import { detectPackageManager, lockfileManagers } from './detection';
import type { Config, PackageManagerType } from './types';

export function doctor(
    root: string,
    config: Config,
    override?: PackageManagerType,
    managerRoot = root,
): number {
    const lines: string[] = [`Project: ${root}`];
    let failures = 0;
    const problem = (text: string) => {
        lines.push(`ERROR: ${text}`);
        failures++;
    };
    try {
        const manager = override ?? detectPackageManager(managerRoot, config);
        const result = spawn.sync(manager, ['--version'], {
            cwd: root,
            encoding: 'utf8',
            timeout: 10000,
            shell: false,
        });
        if (result.error || result.status !== 0)
            problem(
                `${manager} unavailable: ${result.error?.message ?? result.stderr.trim()}`,
            );
        else lines.push(`Package manager: ${manager} ${result.stdout.trim()}`);
    } catch (error) {
        problem(error instanceof Error ? error.message : String(error));
    }
    const candidates = lockfileManagers(root);
    if (candidates.length > 1)
        lines.push(
            `WARNING: Multiple lockfile managers: ${candidates.join(', ')}`,
        );
    lines.push(
        `Automatic migration: ${config.symlink.enabled ? 'enabled' : 'disabled'}`,
    );
    const source = path.join(root, 'node_modules');
    const stats = lstat(source);
    if (!stats)
        lines.push(
            'Dependencies: no node_modules (install first, or use a cache/PnP layout)',
        );
    else if (stats.isSymbolicLink()) {
        const target = path.resolve(root, fs.readlinkSync(source));
        lines.push(`Dependencies: node_modules -> ${target}`);
        if (!fs.existsSync(source))
            problem('Broken node_modules link; dependency target is missing.');
        else if (!fs.statSync(source).isDirectory())
            problem('node_modules link does not point to a directory.');
        if (!lstat(path.join(root, STATE_FILE)))
            lines.push(
                'WARNING: Untracked symlink; restore will refuse to move it.',
            );
    } else if (stats.isDirectory())
        lines.push('Dependencies: regular node_modules directory');
    else problem('node_modules is not a directory or symlink.');
    if (config.symlink.enabled) {
        try {
            const target = dependencyTarget(root, config);
            lines.push(`Configured storage: ${target}`);
            if (!stats?.isSymbolicLink() && lstat(target))
                problem(
                    'Storage destination already exists; migration will not overwrite it.',
                );
        } catch (error) {
            problem(error instanceof Error ? error.message : String(error));
        }
    }
    if (lstat(path.join(root, STATE_FILE))) {
        try {
            restoreDependencies(root, true);
            lines.push('Migration state: valid; restoration available');
        } catch (error) {
            problem(error instanceof Error ? error.message : String(error));
        }
    }
    if (lstat(path.join(root, LOCK_FILE)))
        problem(
            `Operation lock exists: ${LOCK_FILE}. Check for a running process before removing it.`,
        );
    if (config.symlink.enabled && config.symlink.addToGitIgnore) {
        const ignore = path.join(root, '.gitignore');
        const content = fs.existsSync(ignore)
            ? fs.readFileSync(ignore, 'utf8').split(/\r?\n/)
            : [];
        const missing = gitIgnoreRules(root, config).filter(
            (rule) => !content.includes(rule),
        );
        if (missing.length)
            lines.push(
                `WARNING: Missing .gitignore rules: ${missing.join(', ')} (added during migration)`,
            );
    }
    console.info(lines.join('\n'));
    return failures ? 1 : 0;
}
