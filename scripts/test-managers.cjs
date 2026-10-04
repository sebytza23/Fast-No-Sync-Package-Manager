// Opt-in native-manager smoke tests using a local archive, without registry dependencies.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const spawn = require('cross-spawn');
const { fork } = require('node:child_process');
const cli = path.resolve(__dirname, '../dist/index.js');
const scratch = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'fnspm-native-')),
);
const env = {
    ...process.env,
    PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
    DENO_DIR: path.join(scratch, 'deno-cache'),
    YARN_ENABLE_TELEMETRY: '0',
};
let registry;
let registryURL;
async function startRegistry(archive) {
    registry = fork(path.join(__dirname, 'fixture-registry.cjs'), [archive], {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    return new Promise((resolve, reject) => {
        registry.once('message', resolve);
        registry.once('error', reject);
        registry.once('exit', (code) =>
            reject(new Error(`Fixture registry exited: ${code}`)),
        );
    });
}
function lockedInstall(manager) {
    if (['npm', 'deno'].includes(manager)) return ['ci'];
    return [
        'install',
        manager === 'yarn' ? '--immutable' : '--frozen-lockfile',
    ];
}
function configure(root, manager, pnp = false) {
    if (manager === 'yarn')
        fs.writeFileSync(
            path.join(root, '.yarnrc.yml'),
            // Fresh fixtures need to create their first lockfile in CI; later
            // installs still explicitly request --immutable.
            `nodeLinker: ${pnp ? 'pnp' : 'node-modules'}\nenableGlobalCache: false\nenableTelemetry: false\nenableImmutableInstalls: false\n`,
        );
    if (manager === 'deno') {
        fs.writeFileSync(
            path.join(root, '.npmrc'),
            `registry=${registryURL}\n`,
        );
        const manifest = JSON.parse(
            fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
        );
        fs.writeFileSync(
            path.join(root, 'deno.json'),
            JSON.stringify({
                nodeModulesDir: 'auto',
                ...(manifest.workspaces
                    ? {
                          workspace: manifest.workspaces.map((item) =>
                              item.replace('/*', '/web'),
                          ),
                      }
                    : {}),
                tasks: { verify: 'deno run -A verify.cjs' },
            }),
        );
        fs.writeFileSync(
            path.join(root, 'verify.cjs'),
            "if(require('fnspm-fixture')!==42)process.exit(1);\n",
        );
    }
}
function command(executable, args, cwd) {
    const result = spawn.sync(executable, args, {
        cwd,
        env,
        encoding: 'utf8',
        timeout: 60000,
    });
    if (result.error || result.status !== 0)
        throw new Error(
            `${executable} ${args.join(' ')} failed:\n${result.error || result.stderr}\n${result.stdout}`,
        );
    return result.stdout;
}
async function main() {
    try {
        const dependency = path.join(scratch, 'fixture');
        fs.mkdirSync(dependency);
        fs.writeFileSync(
            path.join(dependency, 'package.json'),
            JSON.stringify({
                name: 'fnspm-fixture',
                version: '1.0.0',
                main: 'index.js',
            }),
        );
        fs.writeFileSync(
            path.join(dependency, 'index.js'),
            'module.exports = 42;\n',
        );
        const pack = JSON.parse(
            command(
                'npm',
                [
                    'pack',
                    '--ignore-scripts',
                    '--json',
                    '--pack-destination',
                    scratch,
                ],
                dependency,
            ),
        )[0];
        if (process.argv.slice(2).includes('deno'))
            registryURL = await startRegistry(
                path.join(scratch, pack.filename),
            );
        for (const manager of process.argv.slice(2).length
            ? process.argv.slice(2)
            : ['npm']) {
            if (!['npm', 'bun', 'pnpm', 'yarn', 'deno'].includes(manager))
                throw new Error(
                    'Native smoke tests support npm, bun, pnpm, yarn, deno.',
                );
            const root = path.join(scratch, manager);
            fs.mkdirSync(root);
            fs.writeFileSync(
                path.join(root, 'package.json'),
                JSON.stringify({
                    name: 'fnspm-test-app',
                    private: true,
                    version: '1.0.0',
                    dependencies: {
                        'fnspm-fixture':
                            manager === 'deno'
                                ? '1.0.0'
                                : `file:../${pack.filename}`,
                    },
                    scripts: {
                        verify: `node -e "if(require('fnspm-fixture')!==42)process.exit(1)"`,
                    },
                }),
            );
            configure(root, manager);
            for (const args of [
                ['install'],
                ['install'],
                lockedInstall(manager),
            ]) {
                command(
                    process.execPath,
                    [cli, '--pm', manager, ...args],
                    root,
                );
                assert.ok(
                    fs
                        .lstatSync(path.join(root, 'node_modules'))
                        .isSymbolicLink(),
                    `${manager}: no migrated link`,
                );
                command(
                    process.execPath,
                    ['-e', "if(require('fnspm-fixture')!==42)process.exit(1)"],
                    root,
                );
                command(
                    process.execPath,
                    [
                        cli,
                        '--pm',
                        manager,
                        manager === 'deno' ? 'task' : 'run',
                        'verify',
                    ],
                    root,
                );
                command(
                    process.execPath,
                    [cli, 'doctor', '--pm', manager],
                    root,
                );
            }
            // Simulate an existing 0.2 installation: the link exists without new ownership metadata.
            fs.unlinkSync(path.join(root, '.fnspm-state.json'));
            command(
                process.execPath,
                [cli, '--pm', manager, ...lockedInstall(manager)],
                root,
            );
            command(
                process.execPath,
                ['-e', "if(require('fnspm-fixture')!==42)process.exit(1)"],
                root,
            );
            assert.ok(
                fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink(),
            );
            command(process.execPath, [cli, 'restore'], root);
            assert.ok(
                fs.lstatSync(path.join(root, 'node_modules')).isDirectory(),
            );
            command(
                process.execPath,
                ['-e', "if(require('fnspm-fixture')!==42)process.exit(1)"],
                root,
            );
            console.log(
                `Native ${manager} verified: install, repeat install, lockfile install, resolution, scripts, doctor, legacy upgrade, restore.`,
            );

            const workspace = path.join(scratch, `${manager}-workspace`);
            const section = path.join(workspace, 'packages', 'web');
            fs.mkdirSync(section, { recursive: true });
            fs.writeFileSync(
                path.join(workspace, 'package.json'),
                JSON.stringify({
                    name: 'fnspm-workspace-root',
                    private: true,
                    version: '1.0.0',
                    workspaces: ['packages/*'],
                    dependencies: {
                        'fnspm-fixture':
                            manager === 'deno'
                                ? '1.0.0'
                                : `file:../${pack.filename}`,
                    },
                }),
            );
            fs.writeFileSync(
                path.join(section, 'package.json'),
                JSON.stringify({
                    name: 'fnspm-workspace-web',
                    private: true,
                    version: '1.0.0',
                    dependencies: {
                        'fnspm-fixture':
                            manager === 'deno'
                                ? '1.0.0'
                                : `file:../../../${pack.filename}`,
                    },
                }),
            );
            configure(workspace, manager);
            fs.writeFileSync(
                path.join(section, 'fnspm.config.cjs'),
                "module.exports = {symlink: {nosyncName: 'web.nosync'}};\n",
            );
            if (manager === 'pnpm')
                fs.writeFileSync(
                    path.join(workspace, 'pnpm-workspace.yaml'),
                    "packages:\n  - 'packages/*'\n",
                );
            command(
                process.execPath,
                [cli, '--pm', manager, 'install'],
                workspace,
            );
            for (const args of [['install'], lockedInstall(manager)]) {
                command(
                    process.execPath,
                    [cli, '--pm', manager, ...args],
                    section,
                );
                assert.ok(
                    fs
                        .lstatSync(path.join(workspace, 'node_modules'))
                        .isSymbolicLink(),
                    `${manager}: shared workspace storage was not refreshed`,
                );
                command(
                    process.execPath,
                    ['-e', "if(require('fnspm-fixture')!==42)process.exit(1)"],
                    section,
                );
                command(
                    process.execPath,
                    [cli, 'doctor', '--pm', manager],
                    workspace,
                );
            }
            if (manager === 'npm') {
                command(
                    process.execPath,
                    [
                        cli,
                        '--pm',
                        manager,
                        '--silent',
                        '--workspace',
                        'fnspm-workspace-web',
                        'ci',
                    ],
                    workspace,
                );
                command(
                    process.execPath,
                    [cli, 'doctor', '--pm', manager],
                    workspace,
                );
                command(
                    process.execPath,
                    ['-e', "if(require('fnspm-fixture')!==42)process.exit(1)"],
                    section,
                );
            }
            if (manager === 'pnpm') {
                command(
                    process.execPath,
                    [
                        cli,
                        '--pm',
                        manager,
                        '--filter',
                        'fnspm-workspace-web',
                        'install',
                        '--frozen-lockfile',
                    ],
                    workspace,
                );
                command(
                    process.execPath,
                    [cli, 'doctor', '--pm', manager],
                    workspace,
                );
                command(
                    process.execPath,
                    ['-e', "if(require('fnspm-fixture')!==42)process.exit(1)"],
                    section,
                );
                command(
                    process.execPath,
                    [
                        cli,
                        '--pm',
                        manager,
                        'install',
                        '--force',
                        '--frozen-lockfile',
                    ],
                    workspace,
                );
                command(
                    process.execPath,
                    [cli, 'doctor', '--pm', manager],
                    section,
                );
            }
            command(process.execPath, [cli, 'restore'], workspace);
            console.log(
                `Native ${manager} workspace verified: shared storage, section config, section installs, resolution, doctor, restore.`,
            );
            if (manager === 'yarn') {
                const pnp = path.join(scratch, 'yarn-pnp');
                fs.mkdirSync(pnp);
                fs.copyFileSync(
                    path.join(root, 'package.json'),
                    path.join(pnp, 'package.json'),
                );
                configure(pnp, 'yarn', true);
                command(
                    process.execPath,
                    [cli, '--pm', 'yarn', 'install'],
                    pnp,
                );
                command(
                    process.execPath,
                    [cli, '--pm', 'yarn', 'install', '--immutable'],
                    pnp,
                );
                command(
                    process.execPath,
                    [cli, '--pm', 'yarn', 'run', 'verify'],
                    pnp,
                );
                command(process.execPath, [cli, 'doctor', '--pm', 'yarn'], pnp);
                assert.ok(fs.existsSync(path.join(pnp, '.pnp.cjs')));
                assert.ok(!fs.existsSync(path.join(pnp, 'node_modules')));
                assert.ok(!fs.existsSync(path.join(pnp, '.fnspm-state.json')));
                console.log(
                    'Native Yarn PnP verified: install, immutable install, resolution, doctor, no migration.',
                );
            }
            if (manager === 'deno') {
                const cache = path.join(scratch, 'deno-cache-only');
                fs.mkdirSync(cache);
                fs.writeFileSync(
                    path.join(cache, 'deno.json'),
                    JSON.stringify({
                        nodeModulesDir: 'none',
                        imports: { fixture: `${registryURL}/fixture.js` },
                    }),
                );
                fs.writeFileSync(
                    path.join(cache, 'main.js'),
                    "import value from 'fixture'; if(value!==42)throw new Error('fixture');\n",
                );
                const importAccess = `--allow-import=${new URL(registryURL).host}`;
                command(
                    process.execPath,
                    [cli, '--pm', 'deno', 'install', importAccess],
                    cache,
                );
                command(
                    process.execPath,
                    [cli, '--pm', 'deno', 'run', importAccess, 'main.js'],
                    cache,
                );
                command(
                    process.execPath,
                    [cli, 'doctor', '--pm', 'deno'],
                    cache,
                );
                assert.ok(!fs.existsSync(path.join(cache, 'node_modules')));
                assert.ok(
                    !fs.existsSync(path.join(cache, '.fnspm-state.json')),
                );
                console.log(
                    'Native cache-only Deno verified: install, resolution, doctor, no migration.',
                );
            }
        }
    } finally {
        if (registry?.connected) registry.disconnect();
        if (registry)
            await new Promise((resolve) =>
                registry.exitCode !== null
                    ? resolve()
                    : registry.once('exit', resolve),
            );
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
