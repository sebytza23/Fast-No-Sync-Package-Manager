import fs from 'node:fs';
import path from 'node:path';
import spawn from 'cross-spawn';
import {
    dependencyTarget,
    lstat,
    LOCK_FILE,
    STATE_FILE,
    restoreDependencies,
    repairDependencies,
    addToGitIgnore,
} from './dependencies';
import { withOperationLock } from './operation-lock';
import { detectPackageManager, lockfileManagers } from './detection';
import type { Config, PackageManagerType } from './types';

export function doctor(
    root: string,
    config: Config,
    override?: PackageManagerType,
    managerRoot = root,
    options: { fix?: boolean; dryRun?: boolean } = {},
): number {
    const lines: string[] = [`Project: ${root}`];
    let failures = 0;
    const problem = (text: string) => {
        lines.push(`ERROR: ${text}`);
        failures++;
    };
    if (options.fix) {
        try {
            const repair = () => {
                const storagePlan = repairDependencies(root, true);
                const missing =
                    config.symlink.enabled && config.symlink.addToGitIgnore
                        ? addToGitIgnore(root, config, true)
                        : [];
                // All preflight checks happen before either repair writes anything.
                if (storagePlan)
                    lines.push(
                        options.dryRun
                            ? storagePlan
                            : repairDependencies(root)!,
                    );
                if (missing.length) {
                    if (!options.dryRun) addToGitIgnore(root, config);
                    lines.push(
                        `${options.dryRun ? '[dry-run] Would add' : 'Added'} .gitignore rules: ${missing.join(', ')}`,
                    );
                }
                if (!storagePlan && !missing.length)
                    lines.push('No safe repairs needed.');
            };
            if (options.dryRun) repair();
            else withOperationLock(root, repair);
        } catch (error) {
            problem(
                `Repair refused: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
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
            const recovery = repairDependencies(root, true);
            if (recovery) {
                problem('Recorded storage needs recovery.');
                lines.push(
                    `Next step: fnspm doctor --fix --dry-run\n${recovery}`,
                );
            }
        } catch (error) {
            problem(error instanceof Error ? error.message : String(error));
            lines.push(
                'Inspect the recorded state and dependency paths before recovery; FNSPM will not overwrite or delete conflicting directories.',
            );
        }
    }
    if (lstat(path.join(root, LOCK_FILE)))
        problem(
            `Operation lock exists: ${LOCK_FILE}. Check its pid and startedAt, and confirm that the process is no longer running before manually removing only the lock file.`,
        );
    if (config.symlink.enabled && config.symlink.addToGitIgnore) {
        try {
            const missing = addToGitIgnore(root, config, true);
            if (missing.length) {
                lines.push(
                    `WARNING: Missing .gitignore rules: ${missing.join(', ')} (added during migration)`,
                );
                lines.push('Next step: fnspm doctor --fix --dry-run');
            }
        } catch (error) {
            problem(error instanceof Error ? error.message : String(error));
        }
    }
    console.info(lines.join('\n'));
    return failures ? 1 : 0;
}
