import fs from 'node:fs';
import { listStorage } from './storage-registry';
import { dependencySize, type DependencySize } from './diagnostics';
import {
    relocateDependencies,
    recoverRelocation,
    registerStorage,
} from './dependencies';
import { findMigrationRoot, findWorkspaceRoots } from './project';
import { loadConfig } from './config';
import { withOperationLocks } from './operation-lock';

export function storageAction(args: string[], cwd: string): number {
    const [action, ...flags] = args;
    if (
        !['list', 'register'].includes(action) ||
        flags.some(
            (flag) =>
                !['--json', ...(action === 'list' ? ['--size'] : [])].includes(
                    flag,
                ),
        )
    )
        throw new Error(
            'Usage: fnspm --storage list [--json] [--size] | fnspm --storage register [--json]',
        );
    if (action === 'register') {
        const root = findMigrationRoot(cwd);
        const message = registerStorage(root);
        console.info(
            flags.includes('--json')
                ? JSON.stringify({ schemaVersion: 1, root, message }, null, 2)
                : message,
        );
        return 0;
    }
    const report = listStorage();
    const entries = report.entries.map((entry) => {
        let size: DependencySize | null = null;
        const warnings: string[] = [];
        if (
            flags.includes('--size') &&
            entry.status === 'managed' &&
            entry.record
        ) {
            try {
                const stat = fs.lstatSync(entry.record.target, {
                    bigint: true,
                });
                if (
                    !stat.isDirectory() ||
                    stat.isSymbolicLink() ||
                    stat.dev.toString() !== entry.record.device ||
                    stat.ino.toString() !== entry.record.inode
                )
                    throw new Error('Storage changed before size inspection.');
                size = dependencySize(entry.record.target, (message) =>
                    warnings.push(message),
                );
            } catch (error) {
                warnings.push(String(error));
            }
        }
        return { ...entry, size, warnings };
    });
    if (flags.includes('--json'))
        console.info(JSON.stringify({ ...report, entries }, null, 2));
    else
        console.info(
            [
                'Storage inventory: ' + report.registry,
                ...entries.map((entry) =>
                    [
                        `${entry.status}: ${entry.record?.root ?? entry.file}`,
                        entry.record
                            ? `  Storage: ${entry.record.target}\n  Last recorded: ${entry.record.lastSeen}`
                            : '',
                        entry.message ? '  ' + entry.message : '',
                        entry.size
                            ? '  Logical size: ' +
                              entry.size.apparentBytes +
                              ' bytes'
                            : '',
                        ...entry.warnings.map(
                            (warning) => '  WARNING: ' + warning,
                        ),
                    ]
                        .filter(Boolean)
                        .join('\n'),
                ),
                ...(entries.length
                    ? []
                    : [
                          'No registered dependency storage. Use --storage register in an existing managed project.',
                      ]),
            ].join('\n'),
        );
    return entries.some((entry) =>
        ['invalid', 'changed'].includes(entry.status),
    )
        ? 1
        : 0;
}

export async function relocationAction(
    args: string[],
    cwd: string,
): Promise<number> {
    let mode: 'destination' | 'external' | 'configured' | 'recover' | undefined;
    let destination: string | undefined;
    let dryRun = false;
    let json = false;
    for (const arg of args) {
        if (arg === '--dry-run') dryRun = true;
        else if (arg === '--json') json = true;
        else if (mode)
            throw new Error(
                'Specify exactly one relocation destination or mode.',
            );
        else if (arg === '--external') {
            mode = 'external';
            destination = 'auto';
        } else if (arg === '--configured') mode = 'configured';
        else if (arg === '--recover') mode = 'recover';
        else if (!arg.startsWith('-')) {
            mode = 'destination';
            destination = arg;
        } else throw new Error('Unknown relocation option: ' + arg);
    }
    if (!mode)
        throw new Error(
            'Usage: fnspm --relocate <absolute-path|--external|--configured|--recover> [--dry-run] [--json]',
        );
    const root = findMigrationRoot(cwd);
    try {
        const config = mode === 'recover' ? undefined : await loadConfig(root);
        const message = dryRun
            ? mode === 'recover'
                ? recoverRelocation(root, true)
                : relocateDependencies(root, config!, destination, true)
            : await withOperationLocks(
                  [root, ...findWorkspaceRoots(root)],
                  async () =>
                      mode === 'recover'
                          ? recoverRelocation(root)
                          : relocateDependencies(root, config!, destination),
              );
        console.info(
            json
                ? JSON.stringify(
                      {
                          schemaVersion: 1,
                          operation: 'relocate',
                          status: 'success',
                          root,
                          dryRun,
                          message,
                      },
                      null,
                      2,
                  )
                : message,
        );
        return 0;
    } catch (error) {
        if (!json) throw error;
        console.info(
            JSON.stringify(
                {
                    schemaVersion: 1,
                    operation: 'relocate',
                    status: 'error',
                    root,
                    dryRun,
                    message: String(error),
                },
                null,
                2,
            ),
        );
        return 1;
    }
}
