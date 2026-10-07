#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { displayHelp } from './src/utils/help';
import { initialize } from './src/utils/initialize';
import { PackageManagerFactory } from './src/packages/factory';
import { CommandError } from './src/packages/package_manager';
import {
    findProjectRoot,
    findMigrationRoot,
    findManagedWorkspaceRoots,
    findWorkspaceRoots,
} from './src/utils/project';
import { loadConfig, loadConfigDetails } from './src/utils/config';
import { showConfig } from './src/utils/show-config';
import { withOperationLocks } from './src/utils/operation-lock';
import { detectPackageManager } from './src/utils/detection';
import {
    migrateDependencies,
    restoreDependencies,
    STATE_FILE,
    lstat,
} from './src/utils/dependencies';
import {
    parseRunArgs,
    shouldAutoMigrate,
    isDependencyCommand,
} from './src/utils/cli';
import { doctor } from './src/utils/doctor';
import { configurationFailure } from './src/utils/diagnostics';
import { completionScript } from './src/utils/completion';

export async function main(args = process.argv.slice(2)): Promise<number> {
    if (!args.length || ['help', '--help', '-h'].includes(args[0])) {
        displayHelp();
        return 0;
    }
    if (['--version', '-v'].includes(args[0])) {
        console.info(require('../package.json').version);
        return 0;
    }
    if (args[0] === '--completion') {
        if (args.length !== 2)
            throw new Error(
                'Usage: fnspm --completion <bash|zsh|fish|powershell>',
            );
        console.info(completionScript(args[1]));
        return 0;
    }
    const information = args[0] === '--info';
    if (information) {
        if (args.includes('--fix') || args.includes('--dry-run'))
            throw new Error(
                'Usage: fnspm --info [--json] [--size] [--pm <manager>]',
            );
        args = ['doctor', ...args.slice(1)];
    } else if (args[0] === '--why')
        args = ['config', '--show', ...args.slice(1)];
    const cwd = fs.realpathSync(process.cwd());
    if (['initialize', 'init-config'].includes(args[0])) {
        await initialize(args.slice(1), cwd);
        return 0;
    }
    // Restoration uses recorded ownership, even if the current config is invalid or has changed.
    if (args[0] === 'restore') {
        if (args.slice(1).some((arg) => arg !== '--dry-run'))
            throw new Error('Usage: fnspm restore [--dry-run]');
        console.info(
            restoreDependencies(
                findMigrationRoot(cwd),
                args.includes('--dry-run'),
            ),
        );
        return 0;
    }
    const inspection = args[0] === 'migrate' ? null : parseRunArgs(args);
    const doctorInvocation = inspection?.args[0] === 'doctor';
    if (
        doctorInvocation &&
        (inspection.args
            .slice(1)
            .some(
                (arg) =>
                    !['--fix', '--dry-run', '--json', '--size'].includes(arg),
            ) ||
            (inspection.args.includes('--dry-run') &&
                !inspection.args.includes('--fix')))
    )
        throw new Error(
            'Usage: fnspm doctor [--pm <manager>] [--json] [--size] [--fix [--dry-run]]',
        );
    let root: string;
    try {
        root = fs.realpathSync(findProjectRoot(cwd));
    } catch (error) {
        if (doctorInvocation && inspection.args.includes('--json'))
            return configurationFailure(
                { cwd, projectRoot: cwd, dependencyRoot: cwd },
                error,
                'project.invalid',
            );
        throw error;
    }
    let configDetails;
    try {
        configDetails = await loadConfigDetails(root);
    } catch (error) {
        if (doctorInvocation && inspection.args.includes('--json'))
            return configurationFailure(
                { cwd, projectRoot: root, dependencyRoot: cwd },
                error,
            );
        throw error;
    }
    const config = configDetails.config;
    const dependencyRoot =
        lstat(path.join(cwd, 'node_modules')) ||
        lstat(path.join(cwd, STATE_FILE))
            ? cwd
            : root;
    if (args[0] === 'migrate') {
        if (args.slice(1).some((arg) => arg !== '--dry-run'))
            throw new Error('Usage: fnspm migrate [--dry-run]');
        console.info(
            migrateDependencies(
                dependencyRoot,
                config,
                args.includes('--dry-run'),
            ),
        );
        return 0;
    }
    const parsed = inspection!;
    const ownArgs = parsed.args.slice(
        0,
        parsed.args.indexOf('--') < 0
            ? parsed.args.length
            : parsed.args.indexOf('--'),
    );
    if (ownArgs[0] === 'config' && ownArgs.includes('--show')) {
        if (
            parsed.args
                .slice(1)
                .some((arg) => !['--show', '--json'].includes(arg))
        )
            throw new Error(
                'Usage: fnspm config --show [--json] [--pm <manager>]',
            );
        showConfig(
            configDetails,
            cwd,
            root,
            dependencyRoot,
            parsed.manager,
            parsed.args.includes('--json'),
        );
        return 0;
    }
    if (parsed.args[0] === 'doctor') {
        const context = {
            cwd,
            projectRoot: root,
            dependencyRoot,
            configuration: configDetails,
        };
        try {
            return doctor(dependencyRoot, config, parsed.manager, root, {
                fix: parsed.args.includes('--fix'),
                dryRun: parsed.args.includes('--dry-run'),
                json: parsed.args.includes('--json'),
                size: parsed.args.includes('--size'),
                context,
            });
        } catch (error) {
            if (parsed.args.includes('--json'))
                return configurationFailure(
                    context,
                    error,
                    'inspection.failed',
                );
            throw error;
        }
    }
    const manager = parsed.manager ?? detectPackageManager(root, config);
    const dependencyCommand = isDependencyCommand(parsed.args, manager);
    const optimize = config.symlink.enabled && shouldAutoMigrate(parsed.args);
    const execute = async () => {
        // Restore shared storage already managed by FNSPM before native workspace
        // installs can replace it. Each owner retains its own configuration.
        const sharedStorage = [];
        if (dependencyCommand) {
            for (const workspace of findManagedWorkspaceRoots(cwd)) {
                sharedStorage.push({
                    root: workspace,
                    config: await loadConfig(workspace),
                });
            }
            for (const workspace of sharedStorage)
                restoreDependencies(workspace.root);
        }
        // Clean installs may replace node_modules. Restore tracked storage first so
        // managers operate on their native layout and a fresh migration records its new identity.
        if (
            dependencyCommand &&
            config.symlink.enabled &&
            !lstat(path.join(cwd, STATE_FILE)) &&
            lstat(path.join(cwd, 'node_modules'))?.isSymbolicLink()
        ) {
            try {
                migrateDependencies(cwd, config);
            } catch (error) {
                console.error(
                    `FNSPM could not track existing storage: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
        if (dependencyCommand && fs.existsSync(path.join(cwd, STATE_FILE))) {
            const result = restoreDependencies(cwd);
            if (config.debug.verbose || parsed.debug) console.error(result);
        }
        await PackageManagerFactory(manager).execute(
            parsed.args,
            cwd,
            config.debug.verbose || parsed.debug,
        );
        const migrations = sharedStorage.filter(
            (workspace) => workspace.config.symlink.enabled,
        );
        if (optimize) migrations.push({ root: cwd, config });
        for (const migration of migrations) {
            try {
                const result = migrateDependencies(
                    migration.root,
                    migration.config,
                );
                if (config.debug.verbose || parsed.debug) console.error(result);
            } catch (error) {
                // The package manager succeeded. An optional storage optimization must not change its exit status.
                console.error(
                    `FNSPM migration skipped: ${error instanceof Error ? error.message : String(error)}\nRun fnspm doctor to inspect dependency storage.`,
                );
            }
        }
        return 0;
    };
    if (dependencyCommand || optimize)
        return withOperationLocks(
            [cwd, root, ...findWorkspaceRoots(cwd)],
            execute,
        );
    return execute();
}

if (require.main === module) {
    main()
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error) => {
            console.error(
                `FNSPM: ${error instanceof Error ? error.message : String(error)}`,
            );
            process.exitCode =
                error instanceof CommandError ? error.exitCode : 1;
        });
}

export type {
    Config,
    UserConfig,
    PackageManagerConfig,
    SymlinkConfig,
    DebugConfig,
    PackageManagerType,
    DetectionMode,
} from './src/utils/types';
