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
import { describePackageManager, lockfileManagers } from './detection';
import {
    diagnosticReport,
    dependencySize,
    type DiagnosticContext,
} from './diagnostics';
import type { Config, PackageManagerType } from './types';

export function doctor(
    root: string,
    config: Config,
    override?: PackageManagerType,
    managerRoot = root,
    options: {
        fix?: boolean;
        dryRun?: boolean;
        json?: boolean;
        size?: boolean;
        context?: DiagnosticContext;
    } = {},
): number {
    const report = diagnosticReport(
        options.context ?? {
            cwd: root,
            projectRoot: managerRoot,
            dependencyRoot: root,
        },
    );
    report.repair.requested = Boolean(options.fix);
    report.repair.dryRun = Boolean(options.dryRun);
    const lines: string[] = [`Project: ${root}`];
    let failures = 0;
    const problem = (text: string, code = 'diagnostic.error') => {
        report.issues.push({ severity: 'error', code, message: text });
        lines.push(`ERROR: ${text}`);
        failures++;
    };
    const warning = (text: string, code: string) => {
        lines.push('WARNING: ' + text);
        report.issues.push({ severity: 'warning', code, message: text });
    };
    lines.push(
        `FNSPM: ${report.runtime.fnspm}; Node: ${report.runtime.node}; OS: ${report.runtime.platform} ${report.runtime.arch}`,
    );
    if (options.context?.configuration)
        lines.push(
            `Configuration: ${options.context.configuration.file ?? 'built-in defaults'}`,
        );
    for (const workspace of report.project.workspaceRoots)
        lines.push(`Workspace root: ${workspace}`);
    if (options.fix) {
        try {
            const repair = () => {
                const storagePlan = repairDependencies(root, true);
                const missing =
                    config.symlink.enabled && config.symlink.addToGitIgnore
                        ? addToGitIgnore(root, config, true)
                        : [];
                // All preflight checks happen before either repair writes anything.
                if (storagePlan) {
                    report.repair.actions.push(storagePlan);
                    lines.push(
                        options.dryRun
                            ? storagePlan
                            : repairDependencies(root)!,
                    );
                }
                if (missing.length) {
                    report.repair.actions.push(
                        'Add .gitignore rules: ' + missing.join(', '),
                    );
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
                'repair.refused',
            );
        }
    }
    try {
        const selection = describePackageManager(managerRoot, config, override);
        const manager = selection.name;
        report.packageManager = {
            ...selection,
            version: null,
            available: false,
        };
        lines.push(`Manager selection: ${selection.reason}`);
        const result = spawn.sync(manager, ['--version'], {
            cwd: root,
            encoding: 'utf8',
            timeout: 10000,
            shell: false,
        });
        if (result.error || result.status !== 0)
            problem(
                `${manager} unavailable: ${result.error?.message ?? result.stderr.trim()}`,
                'manager.unavailable',
            );
        else {
            report.packageManager.version = result.stdout.trim();
            report.packageManager.available = true;
            lines.push(`Package manager: ${manager} ${result.stdout.trim()}`);
        }
    } catch (error) {
        problem(
            error instanceof Error ? error.message : String(error),
            'manager.detection',
        );
    }
    const candidates = lockfileManagers(root);
    if (candidates.length > 1)
        warning(
            `Multiple lockfile managers: ${candidates.join(', ')}`,
            'manager.multiple-lockfiles',
        );
    lines.push(
        `Automatic migration: ${config.symlink.enabled ? 'enabled' : 'disabled'}`,
    );
    const source = path.join(root, 'node_modules');
    const stats = lstat(source);
    report.dependencies.layout = !stats
        ? 'absent'
        : stats.isSymbolicLink()
          ? 'symlink'
          : stats.isDirectory()
            ? 'native'
            : 'other';
    if (!stats)
        lines.push(
            'Dependencies: no node_modules (install first, or use a cache/PnP layout)',
        );
    else if (stats.isSymbolicLink()) {
        const target = path.resolve(root, fs.readlinkSync(source));
        report.dependencies.linkTarget = target;
        lines.push(`Dependencies: node_modules -> ${target}`);
        if (!fs.existsSync(source))
            problem(
                'Broken node_modules link; dependency target is missing.',
                'dependencies.broken-link',
            );
        else if (!fs.statSync(source).isDirectory())
            problem(
                'node_modules link does not point to a directory.',
                'dependencies.invalid-link',
            );
        if (!lstat(path.join(root, STATE_FILE)))
            warning(
                'Untracked symlink; restore will refuse to move it.',
                'state.untracked-link',
            );
    } else if (stats.isDirectory())
        lines.push('Dependencies: regular node_modules directory');
    else
        problem(
            'node_modules is not a directory or symlink.',
            'dependencies.invalid-layout',
        );
    report.dependencies.configuredStorage =
        config.symlink.storagePath ??
        path.join(root, config.symlink.nosyncName);
    if (config.symlink.enabled) {
        try {
            const target = dependencyTarget(root, config);
            report.dependencies.configuredStorage = target;
            lines.push(`Configured storage: ${target}`);
            if (!stats?.isSymbolicLink() && lstat(target))
                problem(
                    'Storage destination already exists; migration will not overwrite it.',
                    'storage.destination-exists',
                );
        } catch (error) {
            problem(
                error instanceof Error ? error.message : String(error),
                'storage.invalid-path',
            );
        }
    }
    report.dependencies.state = 'none';
    if (lstat(path.join(root, STATE_FILE))) {
        try {
            restoreDependencies(root, true);
            report.dependencies.state = 'valid';
            lines.push('Migration state: valid; restoration available');
            const recovery = repairDependencies(root, true);
            if (recovery) {
                report.dependencies.state = 'recovery-needed';
                problem(
                    'Recorded storage needs recovery.',
                    'state.recovery-needed',
                );
                lines.push(
                    `Next step: fnspm doctor --fix --dry-run\n${recovery}`,
                );
            }
        } catch (error) {
            report.dependencies.state = 'invalid';
            problem(
                error instanceof Error ? error.message : String(error),
                'state.invalid',
            );
            lines.push(
                'Inspect the recorded state and dependency paths before recovery; FNSPM will not overwrite or delete conflicting directories.',
            );
        }
    }
    report.dependencies.lockPresent = Boolean(
        lstat(path.join(root, LOCK_FILE)),
    );
    if (report.dependencies.lockPresent)
        problem(
            `Operation lock exists: ${LOCK_FILE}. Check its pid and startedAt, and confirm that the process is no longer running before manually removing only the lock file.`,
            'operation.lock-present',
        );
    if (config.symlink.enabled && config.symlink.addToGitIgnore) {
        try {
            const missing = addToGitIgnore(root, config, true);
            if (missing.length) {
                warning(
                    `Missing .gitignore rules: ${missing.join(', ')} (added during migration)`,
                    'ignore.missing-rules',
                );
                lines.push('Next step: fnspm doctor --fix --dry-run');
            }
        } catch (error) {
            problem(
                error instanceof Error ? error.message : String(error),
                'ignore.invalid',
            );
        }
    }
    if (options.size && stats) {
        if (
            stats.isDirectory() ||
            (stats.isSymbolicLink() && report.dependencies.state === 'valid')
        ) {
            try {
                report.dependencies.size = dependencySize(
                    fs.realpathSync(source),
                    (message) => warning(message, 'size.incomplete'),
                );
                const size = report.dependencies.size;
                lines.push(
                    `Dependency size: ${size.apparentBytes} logical bytes in ${size.files} regular files (${size.hardlinksDeduplicated} duplicate hardlinks, ${size.skippedSymlinks} skipped symlinks)`,
                );
            } catch (error) {
                warning(String(error), 'size.unavailable');
            }
        } else
            warning(
                'Size measurement skipped: dependency storage is not a verified regular directory.',
                'size.unverified',
            );
    }
    report.status = failures
        ? 'error'
        : report.issues.length
          ? 'warning'
          : 'healthy';
    lines.push(`Status: ${report.status}`);
    console.info(
        options.json ? JSON.stringify(report, null, 2) : lines.join('\n'),
    );
    return failures ? 1 : 0;
}
