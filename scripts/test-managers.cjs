// Opt-in native-manager smoke tests using a local archive, without registry dependencies.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const spawn = require('cross-spawn');
const cli = path.resolve(__dirname, '../dist/index.js');
const scratch = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'fnspm-native-')),
);
const env = {
    ...process.env,
    PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
};
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
    for (const manager of process.argv.slice(2).length
        ? process.argv.slice(2)
        : ['npm']) {
        if (!['npm', 'bun', 'pnpm'].includes(manager))
            throw new Error('Native smoke tests support npm, bun, pnpm.');
        const root = path.join(scratch, manager);
        fs.mkdirSync(root);
        fs.writeFileSync(
            path.join(root, 'package.json'),
            JSON.stringify({
                name: 'fnspm-test-app',
                private: true,
                version: '1.0.0',
                dependencies: { 'fnspm-fixture': `file:../${pack.filename}` },
                scripts: {
                    verify: `node -e "if(require('fnspm-fixture')!==42)process.exit(1)"`,
                },
            }),
        );
        for (const args of [
            ['install'],
            ['install'],
            manager === 'npm' ? ['ci'] : ['install', '--frozen-lockfile'],
        ]) {
            command(process.execPath, [cli, '--pm', manager, ...args], root);
            assert.ok(
                fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink(),
                `${manager}: no migrated link`,
            );
            command(
                process.execPath,
                ['-e', "if(require('fnspm-fixture')!==42)process.exit(1)"],
                root,
            );
            command(
                process.execPath,
                [cli, '--pm', manager, 'run', 'verify'],
                root,
            );
            command(process.execPath, [cli, 'doctor', '--pm', manager], root);
        }
        // Simulate an existing 0.2 installation: the link exists without new ownership metadata.
        fs.unlinkSync(path.join(root, '.fnspm-state.json'));
        command(
            process.execPath,
            [
                cli,
                '--pm',
                manager,
                ...(manager === 'npm'
                    ? ['ci']
                    : ['install', '--frozen-lockfile']),
            ],
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
        assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
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
                dependencies: { 'fnspm-fixture': `file:../${pack.filename}` },
            }),
        );
        fs.writeFileSync(
            path.join(section, 'package.json'),
            JSON.stringify({
                name: 'fnspm-workspace-web',
                private: true,
                version: '1.0.0',
                dependencies: {
                    'fnspm-fixture': `file:../../../${pack.filename}`,
                },
            }),
        );
        fs.writeFileSync(
            path.join(section, 'fnspm.config.cjs'),
            "module.exports = {symlink: {nosyncName: 'web.nosync'}};\n",
        );
        if (manager === 'pnpm')
            fs.writeFileSync(
                path.join(workspace, 'pnpm-workspace.yaml'),
                "packages:\n  - 'packages/*'\n",
            );
        command(process.execPath, [cli, '--pm', manager, 'install'], workspace);
        for (const args of [
            ['install'],
            manager === 'npm' ? ['ci'] : ['install', '--frozen-lockfile'],
        ]) {
            command(process.execPath, [cli, '--pm', manager, ...args], section);
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
        command(process.execPath, [cli, 'restore'], workspace);
        console.log(
            `Native ${manager} workspace verified: shared storage, section config, section installs, resolution, doctor, restore.`,
        );
    }
} finally {
    fs.rmSync(scratch, { recursive: true, force: true });
}
