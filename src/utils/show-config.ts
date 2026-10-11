import path from 'node:path';
import type { ConfigDetails } from './config';
import { describePackageManager } from './detection';
import type { PackageManagerType } from './types';
import { automaticStorage } from './storage-path';

export function showConfig(
    details: ConfigDetails,
    cwd: string,
    root: string,
    dependencyRoot: string,
    override?: PackageManagerType,
    json = false,
): void {
    const report = {
        cwd,
        projectRoot: root,
        dependencyRoot,
        configurationFile: details.file,
        config: details.config,
        origins: details.origins,
        packageManager: {
            ...describePackageManager(root, details.config, override),
            root,
        },
        dependencyStorage:
            details.config.symlink.storagePath === 'auto'
                ? automaticStorage(dependencyRoot)
                : (details.config.symlink.storagePath ??
                  path.join(dependencyRoot, details.config.symlink.nosyncName)),
    };
    if (json) {
        console.info(JSON.stringify(report, null, 2));
        return;
    }
    const lines = [
        `Invocation directory: ${cwd}`,
        `Project/detection root: ${root}`,
        `Dependency directory: ${dependencyRoot}`,
        `Configuration: ${details.file ?? 'built-in defaults'}`,
        `Package manager: ${report.packageManager.name} (${report.packageManager.reason})`,
        `Configured storage: ${report.dependencyStorage}`,
    ];
    for (const [section, values] of Object.entries(details.config))
        for (const [key, value] of Object.entries(values))
            lines.push(
                `${section}.${key}: ${JSON.stringify(value)} (from ${details.origins[`${section}.${key}`]})`,
            );
    console.info(lines.join('\n'));
}
