const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
    fixture,
    config,
    dependencies,
    stub,
    run,
    cli,
    directoryLink,
} = require('./support.cjs');
const { parseRunArgs, shouldAutoMigrate } = require('../dist/src/utils/cli.js');

test('preserve spaces and shell metacharacters literally', (t) => {
    const root = fixture(t);
    config(root, { symlink: { enabled: false } });
    const env = stub(root);
    const args = [
        'run',
        'example',
        '--',
        'two words',
        'ok; echo injected',
        '$(echo injected)',
        'a&b',
        'a|b',
        '%PATH%',
        '"quoted"',
        '',
    ];
    const result = run(root, ['--pm', 'npm', ...args], env);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(env.ARGS_LOG)).args, args);
});
test('strip wrapper flags before separator and retain flags after it', () => {
    assert.deepEqual(
        parseRunArgs([
            '--pm=pnpm',
            '--debug',
            'run',
            'test',
            '--',
            '--debug',
            '--pm',
            'bun',
        ]),
        {
            manager: 'pnpm',
            debug: true,
            args: ['run', 'test', '--', '--debug', '--pm', 'bun'],
        },
    );
    assert.throws(() => parseRunArgs(['--pm', 'npm']), /No package/);
    assert.throws(
        () => parseRunArgs(['--pm', 'npm', '--pm', 'bun', 'install']),
        /only/,
    );
});
test('preserve child failure code without migrating', (t) => {
    const root = fixture(t);
    dependencies(root);
    const env = stub(root);
    env.STUB_EXIT = '7';
    const result = run(root, ['--pm', 'npm', 'install'], env);
    assert.equal(result.status, 7, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
});
test('stream large stdout and preserve stderr without exec buffer limit', (t) => {
    const root = fixture(t);
    const env = stub(root);
    env.STUB_OUTPUT = '1200000';
    const result = run(root, ['--pm', 'npm', 'run', 'big'], env);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.length, 1200000);
    assert.match(result.stderr, /stderr kept/);
});
test('global and redirected installs never migrate local dependencies', (t) => {
    const root = fixture(t);
    dependencies(root);
    const env = stub(root);
    for (const args of [
        ['install', '-g'],
        ['install', '--prefix=elsewhere'],
        ['install', '--cwd', 'elsewhere'],
        ['install', '-Celsewhere'],
        ['install', '--dry-run'],
    ]) {
        assert.equal(run(root, ['--pm', 'npm', ...args], env).status, 0);
        assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
    }
    assert.equal(shouldAutoMigrate(['run', 'build']), true);
});
test('successful dependency command migrates even without .gitignore', (t) => {
    const root = fixture(t);
    dependencies(root);
    const result = run(root, ['--pm', 'npm', 'install'], stub(root));
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink());
    assert.ok(fs.existsSync(path.join(root, '.gitignore')));
});
test('optional optimization failure keeps successful command status', (t) => {
    const root = fixture(t);
    dependencies(root);
    fs.mkdirSync(path.join(root, 'node_modules.nosync'));
    const result = run(root, ['--pm', 'npm', 'install'], stub(root));
    assert.equal(result.status, 0);
    assert.match(result.stderr, /already exists/);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
});
test('root config applies in workspace while execution remains in caller directory', (t) => {
    const root = fixture(t, {
        workspaces: ['packages/*'],
        packageManager: 'pnpm@10',
    });
    config(root, { symlink: { enabled: false } });
    const env = stub(root);
    const nested = path.join(root, 'packages', 'app');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'package.json'), '{}');
    const result = run(nested, ['install'], env);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(fs.readFileSync(env.ARGS_LOG)).cwd, nested);
});
test('ESM initialization options produce usable config', (t) => {
    const root = fixture(t, { type: 'module' });
    let result = run(root, [
        'initialize',
        '--pm',
        'bun',
        '--detection',
        'default',
        '--no-symlink',
    ]);
    assert.equal(result.status, 0, result.stderr);
    result = run(root, ['install'], stub(root));
    assert.equal(result.status, 0, result.stderr);
    assert.match(
        fs.readFileSync(path.join(root, 'fnspm.config.mjs'), 'utf8'),
        /"default": "bun"/,
    );
});
test('help and version work without loading invalid config or running package managers', (t) => {
    const root = fixture(t);
    config(root, { symlink: { enabled: 'bad' } });
    assert.equal(run(root, ['--help']).status, 0);
    assert.match(run(root, ['--help']).stdout, /doctor/);
    assert.equal(
        run(root, ['--version']).stdout.trim(),
        require('../package.json').version,
    );
});
test('library import has no CLI side effects', (t) => {
    const root = fixture(t);
    const result = spawnSync(
        process.execPath,
        ['-e', `require(${JSON.stringify(cli)});console.log('imported')`],
        { cwd: root, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'imported');
});
test('doctor reports healthy tracked storage and broken links', (t) => {
    const root = fixture(t);
    dependencies(root);
    const env = stub(root);
    assert.equal(run(root, ['migrate'], env).status, 0);
    let result = run(root, ['doctor', '--pm', 'npm'], env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /restoration available/);
    fs.renameSync(
        path.join(root, 'node_modules.nosync'),
        path.join(root, 'lost-storage'),
    );
    result = run(root, ['doctor', '--pm', 'npm'], env);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Broken/);
});
test('doctor identifies replaced storage', (t) => {
    const root = fixture(t);
    dependencies(root);
    const env = stub(root);
    run(root, ['migrate'], env);
    fs.renameSync(
        path.join(root, 'node_modules.nosync'),
        path.join(root, 'original-storage'),
    );
    fs.mkdirSync(path.join(root, 'node_modules.nosync'));
    const result = run(root, ['doctor', '--pm', 'npm'], env);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /replaced/);
});
test('restore remains available after invalid config', (t) => {
    const root = fixture(t);
    dependencies(root);
    assert.equal(run(root, ['migrate']).status, 0);
    config(root, { symlink: { enabled: 'invalid' } });
    assert.equal(run(root, ['restore']).status, 0);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
});
test('missing manager reports actionable error', (t) => {
    const root = fixture(t);
    const env = { ...process.env, PATH: path.join(root, 'empty') };
    const result = run(root, ['--pm', 'deno', 'install'], env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not installed/);
});
test('ambiguous managers fail before executing child', (t) => {
    const root = fixture(t);
    fs.writeFileSync(path.join(root, 'yarn.lock'), '');
    fs.writeFileSync(path.join(root, 'bun.lock'), '');
    const env = stub(root);
    const result = run(root, ['install'], env);
    assert.equal(result.status, 1);
    assert.ok(!fs.existsSync(env.ARGS_LOG));
});
test('clean installs after migration get a fresh tracked directory', (t) => {
    const root = fixture(t);
    dependencies(root);
    const env = stub(root);
    assert.equal(run(root, ['migrate'], env).status, 0);
    const script = path.join(root, 'bin', 'stub.cjs');
    fs.writeFileSync(
        script,
        `const fs=require('node:fs');fs.rmSync('node_modules',{recursive:true,force:true});fs.mkdirSync('node_modules');fs.writeFileSync('node_modules/fresh','ok');`,
    );
    const result = run(root, ['--pm', 'npm', 'ci'], env);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink());
    assert.equal(
        fs.readFileSync(path.join(root, 'node_modules', 'fresh'), 'utf8'),
        'ok',
    );
    assert.equal(run(root, ['restore'], env).status, 0);
});
test('disabling automatic migration restores tracked layout before install', (t) => {
    const root = fixture(t);
    dependencies(root);
    run(root, ['migrate']);
    config(root, { symlink: { enabled: false } });
    const result = run(root, ['--pm', 'npm', 'install'], stub(root));
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
    assert.ok(!fs.existsSync(path.join(root, '.fnspm-state.json')));
});
test(
    'SIGTERM is forwarded and signal exit status preserved',
    { skip: process.platform === 'win32' },
    async (t) => {
        const root = fixture(t);
        config(root, { symlink: { enabled: false } });
        const env = stub(root);
        fs.writeFileSync(
            path.join(root, 'bin', 'stub.cjs'),
            `require('node:fs').writeFileSync(process.env.ARGS_LOG,String(process.pid));setInterval(()=>{},1000);`,
        );
        const { spawn } = require('node:child_process');
        const { setTimeout: wait } = require('node:timers/promises');
        const child = spawn(
            process.execPath,
            [cli, '--pm', 'npm', 'run', 'forever'],
            { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        t.after(() => {
            if (child.exitCode === null) child.kill('SIGKILL');
        });
        const closed = new Promise((resolve) =>
            child.once('close', (code, signal) => resolve({ code, signal })),
        );
        for (let i = 0; i < 100 && !fs.existsSync(env.ARGS_LOG); i++)
            await wait(30);
        assert.ok(fs.existsSync(env.ARGS_LOG), 'manager did not start');
        child.kill('SIGTERM');
        const result = await closed;
        assert.equal(result.code, 143);
        assert.equal(result.signal, null);
    },
);
test('restore remains available with malformed package.json', (t) => {
    const root = fixture(t);
    dependencies(root);
    assert.equal(run(root, ['migrate']).status, 0);
    fs.writeFileSync(path.join(root, 'package.json'), '{');
    const result = run(root, ['restore']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
});
test('initialize in a workspace section creates a local override without changing parent', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    config(root, { packageManager: { default: 'npm' } });
    const before = fs.readFileSync(path.join(root, 'fnspm.config.cjs'), 'utf8');
    const section = path.join(root, 'packages', 'web');
    fs.mkdirSync(section, { recursive: true });
    fs.writeFileSync(
        path.join(section, 'package.json'),
        JSON.stringify({ type: 'module' }),
    );
    const result = run(section, [
        'initialize',
        '--pm',
        'bun',
        '--detection',
        'default',
        '--sync-folder',
        'web.nosync',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
        fs.readFileSync(path.join(root, 'fnspm.config.cjs'), 'utf8'),
        before,
    );
    assert.match(
        fs.readFileSync(path.join(section, 'fnspm.config.mjs'), 'utf8'),
        /"default": "bun"/,
    );
});
test('section config and auto conversion stay independent from parent and siblings', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    dependencies(root);
    config(root, {
        packageManager: { default: 'npm', detection: 'default' },
        symlink: { enabled: false },
    });
    const env = stub(root);
    const section = path.join(root, 'packages', 'web');
    fs.mkdirSync(section, { recursive: true });
    fs.writeFileSync(path.join(section, 'package.json'), '{}');
    dependencies(section);
    config(section, {
        packageManager: { default: 'bun', detection: 'default' },
        symlink: { enabled: true, nosyncName: 'web.nosync' },
        debug: { verbose: true },
    });
    const sibling = path.join(root, 'packages', 'server');
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(sibling, 'package.json'), '{}');
    dependencies(sibling);
    const result = run(section, ['install'], env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Running: "bun"/);
    assert.ok(
        fs.lstatSync(path.join(section, 'node_modules')).isSymbolicLink(),
    );
    assert.ok(fs.existsSync(path.join(section, 'web.nosync', 'sentinel.txt')));
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
    assert.ok(fs.lstatSync(path.join(sibling, 'node_modules')).isDirectory());
    assert.equal(run(section, ['restore'], env).status, 0);
});
test('inherited config converts local section dependencies and survives local state and lockfile', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    dependencies(root);
    config(root, {
        packageManager: { default: 'pnpm', detection: 'default' },
        symlink: { nosyncName: 'shared-settings.nosync' },
    });
    const env = stub(root);
    const section = path.join(root, 'packages', 'web');
    fs.mkdirSync(section, { recursive: true });
    fs.writeFileSync(path.join(section, 'package.json'), '{}');
    dependencies(section);
    const first = run(section, ['install'], env);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(
        fs.existsSync(
            path.join(section, 'shared-settings.nosync', 'sentinel.txt'),
        ),
    );
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
    fs.writeFileSync(path.join(section, 'package-lock.json'), '{}');
    const second = run(section, ['--debug', 'install'], env);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stderr, /Running: "pnpm"/);
    assert.ok(
        fs.lstatSync(path.join(section, 'node_modules')).isSymbolicLink(),
    );
    assert.ok(!fs.existsSync(path.join(section, 'node_modules.nosync')));
    assert.equal(run(section, ['doctor'], env).status, 0);
});
test('automatic conversion after non-install native commands preserves previous behavior', (t) => {
    const root = fixture(t);
    dependencies(root);
    const env = stub(root);
    const result = run(root, ['--pm', 'npm', 'run', 'build'], env);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink());
});
test('a command in a plain subdirectory does not migrate ancestor dependencies', (t) => {
    const root = fixture(t);
    dependencies(root);
    config(root, {});
    const env = stub(root);
    const section = path.join(root, 'src');
    fs.mkdirSync(section);
    const result = run(section, ['--pm', 'npm', 'run', 'build'], env);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
});
test('clean install adopts a legacy nosync link before replacing node_modules', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    const target = path.join(root, 'node_modules.nosync');
    fs.renameSync(source, target);
    directoryLink(target, source);
    const env = stub(root);
    fs.writeFileSync(
        path.join(root, 'bin', 'stub.cjs'),
        `const fs=require('node:fs');fs.rmSync('node_modules',{recursive:true,force:true});fs.mkdirSync('node_modules');fs.writeFileSync('node_modules/new','fresh');`,
    );
    const result = run(root, ['--pm', 'npm', 'ci'], env);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.lstatSync(source).isSymbolicLink());
    assert.equal(fs.readFileSync(path.join(source, 'new'), 'utf8'), 'fresh');
    assert.equal(run(root, ['restore'], env).status, 0);
});
test('uppercase manager override remains compatible', (t) => {
    const root = fixture(t);
    const result = run(root, ['--pm', 'BUN', '--version'], stub(root));
    assert.equal(result.status, 0, result.stderr);
});

test('section clean installs refresh tracked workspace storage with its own config', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    config(root, { symlink: { nosyncName: 'root.nosync' } });
    dependencies(root);
    assert.equal(run(root, ['migrate']).status, 0);
    const section = path.join(root, 'packages', 'web');
    fs.mkdirSync(section, { recursive: true });
    fs.writeFileSync(path.join(section, 'package.json'), '{}');
    config(section, { symlink: { enabled: false } });
    const env = stub(root);
    fs.writeFileSync(
        path.join(root, 'bin', 'stub.cjs'),
        `
        const fs = require('node:fs'), path = require('node:path');
        const root = path.resolve('../..');
        if (fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink()) process.exit(8);
        fs.rmSync(path.join(root, 'node_modules'), {recursive:true});
        fs.mkdirSync(path.join(root, 'node_modules'));
        fs.writeFileSync(path.join(root, 'node_modules', 'fresh'), 'ok');
    `,
    );
    const result = run(section, ['--pm', 'npm', 'ci'], env);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink());
    assert.equal(
        fs.readFileSync(path.join(root, 'root.nosync', 'fresh'), 'utf8'),
        'ok',
    );
    assert.ok(!fs.existsSync(path.join(section, '.fnspm-state.json')));
    assert.equal(run(root, ['restore']).status, 0);
});

test('failed workspace installs preserve exit code and leave shared storage restored', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    dependencies(root);
    assert.equal(run(root, ['migrate']).status, 0);
    const section = path.join(root, 'packages', 'web');
    fs.mkdirSync(section, { recursive: true });
    fs.writeFileSync(path.join(section, 'package.json'), '{}');
    const env = stub(root);
    env.STUB_EXIT = '7';
    const result = run(section, ['--pm', 'npm', 'ci'], env);
    assert.equal(result.status, 7, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
    assert.equal(
        fs.readFileSync(
            path.join(root, 'node_modules', 'sentinel.txt'),
            'utf8',
        ),
        'preserve me',
    );
    assert.ok(!fs.existsSync(path.join(root, '.fnspm-state.json')));
});

test('disabled workspace migration keeps native layout after a section install', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    dependencies(root);
    assert.equal(run(root, ['migrate']).status, 0);
    config(root, { symlink: { enabled: false } });
    const section = path.join(root, 'packages', 'web');
    fs.mkdirSync(section, { recursive: true });
    fs.writeFileSync(path.join(section, 'package.json'), '{}');
    const result = run(section, ['--pm', 'npm', 'install'], stub(root));
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
    assert.ok(!fs.existsSync(path.join(root, '.fnspm-state.json')));
});

test('workspace storage discovery stops at a nested Git boundary', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    dependencies(root);
    assert.equal(run(root, ['migrate']).status, 0);
    const section = path.join(root, 'packages', 'web');
    fs.mkdirSync(section, { recursive: true });
    fs.mkdirSync(path.join(section, '.git'));
    fs.writeFileSync(path.join(section, 'package.json'), '{}');
    const result = run(section, ['--pm', 'npm', 'install'], stub(root));
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink());
    assert.equal(run(root, ['restore']).status, 0);
});
