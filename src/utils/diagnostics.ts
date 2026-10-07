import fs from 'node:fs';
import path from 'node:path';
import type { ConfigDetails } from './config';
import { findWorkspaceRoots } from './project';
import { STATE_FILE, LOCK_FILE, lstat } from './dependencies';

export interface DiagnosticContext {
    cwd: string;
    projectRoot: string;
    dependencyRoot: string;
    configuration?: ConfigDetails;
}
export interface DiagnosticIssue {
    severity: 'error' | 'warning';
    code: string;
    message: string;
}
export interface DependencySize {
    path: string;
    apparentBytes: string;
    files: number;
    directories: number;
    skippedSymlinks: number;
    hardlinksDeduplicated: number;
    complete: boolean;
}
export function diagnosticReport(context: DiagnosticContext) {
    let workspaceRoots: string[] = [];
    try {
        workspaceRoots = findWorkspaceRoots(context.cwd);
    } catch {
        /* The primary configuration/project error is reported by the caller. */
    }
    return {
        schemaVersion: 1,
        status: 'healthy' as 'healthy' | 'warning' | 'error',
        runtime: {
            fnspm: require('../../../package.json').version as string,
            node: process.versions.node,
            platform: process.platform,
            arch: process.arch,
        },
        project: {
            cwd: context.cwd,
            root: context.projectRoot,
            dependencyRoot: context.dependencyRoot,
            workspaceRoots,
        },
        configuration: context.configuration ?? null,
        packageManager: null as null | {
            name: string;
            reason: string;
            version: string | null;
            available: boolean;
        },
        dependencies: {
            source: path.join(context.dependencyRoot, 'node_modules'),
            layout: 'unknown' as
                'unknown' | 'absent' | 'native' | 'symlink' | 'other',
            linkTarget: null as string | null,
            configuredStorage: null as string | null,
            state: 'unknown' as
                'unknown' | 'none' | 'valid' | 'recovery-needed' | 'invalid',
            stateFile: path.join(context.dependencyRoot, STATE_FILE),
            lockPresent: null as boolean | null,
            operationLockFile: path.join(context.dependencyRoot, LOCK_FILE),
            size: null as DependencySize | null,
        },
        repair: { requested: false, dryRun: false, actions: [] as string[] },
        issues: [] as DiagnosticIssue[],
    };
}
export function configurationFailure(
    context: DiagnosticContext,
    error: unknown,
    code = 'configuration.invalid',
): number {
    const report = diagnosticReport(context);
    report.status = 'error';
    report.issues.push({
        severity: 'error',
        code,
        message: error instanceof Error ? error.message : String(error),
    });
    console.info(JSON.stringify(report, null, 2));
    return 1;
}

/** Logical bytes of unique regular files; never intentionally traverse child symlinks. */
export function dependencySize(
    root: string,
    warning: (message: string) => void,
): DependencySize {
    const result: DependencySize = {
        path: root,
        apparentBytes: '0',
        files: 0,
        directories: 0,
        skippedSymlinks: 0,
        hardlinksDeduplicated: 0,
        complete: true,
    };
    const initial = fs.lstatSync(root, { bigint: true });
    if (!initial.isDirectory() || initial.isSymbolicLink())
        throw new Error('Size measurement requires a regular directory.');
    const directories = [root];
    const identities = new Set<string>();
    let bytes = 0n;
    const incomplete = (message: string) => {
        result.complete = false;
        warning(message);
    };
    while (directories.length) {
        const directory = directories.pop()!;
        try {
            const stats = lstat(directory);
            if (!stats?.isDirectory() || stats.isSymbolicLink()) {
                incomplete(
                    'Dependency directory changed during size measurement: ' +
                        directory,
                );
                continue;
            }
            result.directories++;
            for (const name of fs.readdirSync(directory)) {
                const file = path.join(directory, name);
                try {
                    const info = fs.lstatSync(file, { bigint: true });
                    if (info.isSymbolicLink()) result.skippedSymlinks++;
                    else if (info.isDirectory()) directories.push(file);
                    else if (info.isFile()) {
                        result.files++;
                        const identity =
                            info.ino === 0n ? file : info.dev + ':' + info.ino;
                        if (identities.has(identity))
                            result.hardlinksDeduplicated++;
                        else {
                            identities.add(identity);
                            bytes += info.size;
                        }
                    }
                } catch (error) {
                    incomplete(String(error));
                }
            }
        } catch (error) {
            incomplete(String(error));
        }
    }
    const final = fs.lstatSync(root, { bigint: true, throwIfNoEntry: false });
    if (
        !final ||
        final.dev !== initial.dev ||
        final.ino !== initial.ino ||
        !final.isDirectory() ||
        final.isSymbolicLink()
    )
        incomplete('Dependency root changed during size measurement.');
    result.apparentBytes = bytes.toString();
    return result;
}
