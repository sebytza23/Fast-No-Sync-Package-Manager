const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: pause } = require('node:timers/promises');
const {
    fixture,
    config,
    dependencies,
    directoryLink,
    run,
    stub,
} = require('./support.cjs');
const { mergeConfig, validateConfig } = require('../dist/src/utils/config.js');
const {
    migrateDependencies,
    restoreDependencies,
    relocateDependencies,
    recoverRelocation,
    repairDependencies,
    registerStorage,
    STATE_FILE,
    LOCK_FILE,
} = require('../dist/src/utils/dependencies.js');
const {
    automaticStorage,
    RELOCATION_FILE,
    STORAGE_FILE,
} = require('../dist/src/utils/storage-path.js');
const { listStorage } = require('../dist/src/utils/storage-registry.js');

function inventory(t) {
    const data = fixture(t);
    const before = process.env.FNSPM_DATA_DIR;
    process.env.FNSPM_DATA_DIR = data;
    t.after(() => {
        if (before === undefined) delete process.env.FNSPM_DATA_DIR;
        else process.env.FNSPM_DATA_DIR = before;
    });
    return data;
}
function state(root) {
    return JSON.parse(fs.readFileSync(path.join(root, STATE_FILE), 'utf8'));
}
function sentinel(root) {
    return fs.readFileSync(
        path.join(root, 'node_modules', 'sentinel.txt'),
        'utf8',
    );
}

test('external initialization selects deterministic automatic storage without creating it', (t) => {
    const data = inventory(t);
    const root = fixture(t);
    const initialized = run(root, ['initialize', '--external']);
    assert.equal(initialized.status, 0, initialized.stderr);
    const settings = require(path.join(root, 'fnspm.config.cjs'));
    assert.equal(settings.symlink.storagePath, 'auto');
    validateConfig(mergeConfig({ symlink: { storagePath: 'auto' } }));
    assert.ok(!fs.existsSync(path.join(data, 'storage')));
    dependencies(root);
    const migrated = run(root, ['migrate']);
    assert.equal(migrated.status, 0, migrated.stderr);
    assert.equal(state(root).target, automaticStorage(root));
    assert.equal(sentinel(root), 'preserve me');
});

test('automatic storage separates equal project names and counts internal links correctly', (t) => {
    inventory(t);
    const projects = [fixture(t), fixture(t)].map((parent) => {
        const root = path.join(parent, 'app');
        fs.mkdirSync(root);
        fs.writeFileSync(path.join(root, 'package.json'), '{}');
        return root;
    });
    const settings = mergeConfig({ symlink: { storagePath: 'auto' } });
    for (const root of projects) {
        const source = dependencies(root);
        fs.mkdirSync(path.join(source, 'package'));
        fs.writeFileSync(path.join(source, 'package', 'value'), '42');
        directoryLink(
            process.platform === 'win32'
                ? path.join(source, 'package')
                : 'package',
            path.join(source, 'linked'),
        );
        migrateDependencies(root, settings);
        assert.equal(
            fs.readFileSync(path.join(source, 'linked', 'value'), 'utf8'),
            '42',
        );
    }
    assert.notEqual(state(projects[0]).target, state(projects[1]).target);
    assert.equal(listStorage().entries.length, 2);
    assert.ok(
        listStorage().entries.every((entry) => entry.status === 'managed'),
    );
    for (const root of projects) restoreDependencies(root);
    assert.ok(
        listStorage().entries.every((entry) => entry.status === 'restored'),
    );
});

test('automatic dry runs create no parent directories or registry entries', (t) => {
    const data = inventory(t);
    const root = fixture(t);
    const source = dependencies(root);
    const settings = mergeConfig({ symlink: { storagePath: 'auto' } });
    const before = fs.readdirSync(data);
    assert.match(migrateDependencies(root, settings, true), /dry-run/);
    assert.deepEqual(fs.readdirSync(data), before);
    assert.ok(fs.lstatSync(source).isDirectory());
    assert.ok(!fs.existsSync(path.join(root, STATE_FILE)));
    assert.equal(listStorage().entries.length, 0);
    assert.deepEqual(fs.readdirSync(data), before);
});

test('automatic migration refuses occupied destinations and another filesystem before moving files', (t) => {
    const data = inventory(t);
    const root = fixture(t);
    const source = dependencies(root);
    const settings = mergeConfig({ symlink: { storagePath: 'auto' } });
    const stat = fs.statSync;
    t.mock.method(fs, 'statSync', (file, ...args) => {
        const result = stat(file, ...args);
        if (file === data)
            result.dev += typeof result.dev === 'bigint' ? 1n : 1;
        return result;
    });
    assert.throws(() => migrateDependencies(root, settings), /same filesystem/);
    t.mock.restoreAll();
    const target = automaticStorage(root);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'foreign'), 'keep');
    assert.throws(() => migrateDependencies(root, settings), /already exists/);
    assert.ok(fs.lstatSync(source).isDirectory());
    assert.ok(!fs.existsSync(path.join(root, STATE_FILE)));
    assert.equal(fs.readFileSync(path.join(target, 'foreign'), 'utf8'), 'keep');
});

test(
    'external storage and relocation refuse workspace links whose relative resolution changes',
    { skip: process.platform === 'win32' },
    (t) => {
        inventory(t);
        const root = fixture(t);
        const source = dependencies(root);
        fs.mkdirSync(path.join(root, 'workspace'));
        directoryLink('../workspace', path.join(source, 'workspace'));
        assert.throws(
            () =>
                migrateDependencies(
                    root,
                    mergeConfig({ symlink: { storagePath: 'auto' } }),
                ),
            /relative link/,
        );
        assert.ok(fs.lstatSync(source).isDirectory());
        migrateDependencies(root, mergeConfig());
        assert.throws(
            () => relocateDependencies(root, mergeConfig(), 'auto'),
            /relative link/,
        );
        assert.ok(!fs.existsSync(path.join(root, RELOCATION_FILE)));
        assert.equal(sentinel(root), 'preserve me');
    },
);

test('inventory and optional size work without loading executable project configuration', (t) => {
    inventory(t);
    const root = fixture(t);
    dependencies(root);
    migrateDependencies(
        root,
        mergeConfig({ symlink: { storagePath: 'auto' } }),
    );
    fs.writeFileSync(
        path.join(root, 'fnspm.config.cjs'),
        'throw new Error("inventory must not evaluate configuration")',
    );
    const result = run(root, ['--storage', 'list', '--json']);
    assert.equal(result.status, 0, result.stderr);
    const entry = JSON.parse(result.stdout).entries[0];
    assert.equal(entry.status, 'managed');
    assert.equal(entry.size, null);
    assert.ok(entry.record.lastSeen);
    const sized = run(root, ['--storage', 'list', '--json', '--size']);
    assert.equal(sized.status, 0, sized.stderr);
    assert.equal(
        JSON.parse(sized.stdout).entries[0].size.apparentBytes,
        String(Buffer.byteLength('preserve me')),
    );
});

test('unavailable projects retain their storage and are never classified as unused', (t) => {
    inventory(t);
    const root = fixture(t);
    const parked = fixture(t);
    dependencies(root);
    migrateDependencies(
        root,
        mergeConfig({ symlink: { storagePath: 'auto' } }),
    );
    const target = state(root).target;
    fs.renameSync(root, path.join(parked, 'project'));
    const report = listStorage();
    assert.equal(report.entries[0].status, 'unavailable');
    assert.match(report.entries[0].message, /does not establish/);
    const result = run(parked, ['--storage', 'list', '--json', '--size']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).entries[0].size, null);
    assert.equal(
        fs.readFileSync(path.join(target, 'sentinel.txt'), 'utf8'),
        'preserve me',
    );
});

test('inventory detects replaced project/storage identities and invalid records without writing', (t) => {
    const data = inventory(t);
    const root = fixture(t);
    const parked = fixture(t);
    dependencies(root);
    migrateDependencies(
        root,
        mergeConfig({ symlink: { storagePath: 'auto' } }),
    );
    const target = state(root).target;
    fs.renameSync(target, path.join(parked, 'original'));
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'foreign'), 'keep');
    assert.equal(listStorage().entries[0].status, 'changed');
    fs.renameSync(root, path.join(parked, 'project'));
    fs.mkdirSync(root);
    assert.equal(listStorage().entries[0].status, 'changed');
    const registry = path.join(data, 'registry');
    const file = path.join(registry, fs.readdirSync(registry)[0]);
    fs.writeFileSync(file, '{broken');
    const before = fs.readFileSync(file, 'utf8');
    assert.equal(listStorage().entries[0].status, 'invalid');
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(fs.readFileSync(path.join(target, 'foreign'), 'utf8'), 'keep');
});

test('registry write failure does not fail a completed migration or overwrite a foreign file', (t) => {
    const data = inventory(t);
    const root = fixture(t);
    dependencies(root);
    fs.writeFileSync(path.join(data, 'registry'), 'keep');
    const warnings = [];
    t.mock.method(console, 'error', (message) => warnings.push(message));
    migrateDependencies(root, mergeConfig());
    assert.equal(sentinel(root), 'preserve me');
    assert.equal(state(root).version, 1);
    assert.ok(warnings.some((message) => message.includes('inventory')));
    assert.equal(fs.readFileSync(path.join(data, 'registry'), 'utf8'), 'keep');
});

test('relocation previews never write and chosen storage persists across restore and reinstall', (t) => {
    inventory(t);
    const root = fixture(t);
    const external = fixture(t);
    dependencies(root);
    config(root, {});
    const originalConfig = fs.readFileSync(
        path.join(root, 'fnspm.config.cjs'),
        'utf8',
    );
    migrateDependencies(root, mergeConfig());
    const original = state(root);
    const target = path.join(external, 'deps');
    const before = fs.readdirSync(root).sort();
    assert.match(
        relocateDependencies(root, mergeConfig(), target, true),
        /dry-run/,
    );
    assert.deepEqual(fs.readdirSync(root).sort(), before);
    assert.ok(!fs.existsSync(target));
    relocateDependencies(root, mergeConfig(), target);
    assert.equal(state(root).target, target);
    assert.equal(state(root).inode, original.inode);
    assert.equal(state(root).version, 1);
    assert.equal(sentinel(root), 'preserve me');
    assert.ok(!fs.existsSync(original.target));
    assert.ok(!fs.existsSync(path.join(root, RELOCATION_FILE)));
    assert.equal(
        fs.readFileSync(path.join(root, 'fnspm.config.cjs'), 'utf8'),
        originalConfig,
    );
    const env = stub(root);
    const installed = run(root, ['--pm', 'npm', 'install'], env);
    assert.equal(installed.status, 0, installed.stderr);
    assert.equal(state(root).target, target);
    const why = JSON.parse(run(root, ['--why', '--json'], env).stdout);
    assert.equal(why.config.symlink.storagePath, target);
    assert.equal(
        why.origins['symlink.storagePath'],
        path.join(root, STORAGE_FILE),
    );
    restoreDependencies(root);
    migrateDependencies(root, mergeConfig());
    assert.equal(state(root).target, target);
    relocateDependencies(root, mergeConfig(), undefined);
    assert.equal(state(root).target, original.target);
    assert.ok(!fs.existsSync(path.join(root, STORAGE_FILE)));
    assert.equal(sentinel(root), 'preserve me');
});

test('external relocation and section preferences remain independent from workspace configuration', (t) => {
    inventory(t);
    const root = fixture(t, { workspaces: ['packages/*'] });
    config(root, {});
    dependencies(root);
    const section = path.join(root, 'packages', 'web');
    fs.mkdirSync(section, { recursive: true });
    fs.writeFileSync(path.join(section, 'package.json'), '{}');
    dependencies(section);
    migrateDependencies(root, mergeConfig());
    migrateDependencies(section, mergeConfig());
    const parent = state(root).target;
    const result = run(section, ['--relocate', '--external', '--json']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(state(section).target, automaticStorage(section));
    assert.equal(state(root).target, parent);
    const env = stub(root);
    const info = run(section, ['--info', '--json'], env);
    assert.equal(info.status, 0, info.stderr);
    const report = JSON.parse(info.stdout);
    assert.equal(report.configuration.config.symlink.storagePath, 'auto');
    assert.equal(
        report.dependencies.configuredStorage,
        automaticStorage(section),
    );
    assert.equal(report.dependencies.state, 'valid');
    assert.equal(listStorage().entries.length, 2);
});

test('relocation refuses occupied targets, overlapping paths, invalid arguments and held locks', (t) => {
    inventory(t);
    const root = fixture(t);
    const external = fixture(t);
    dependencies(root);
    migrateDependencies(root, mergeConfig());
    const target = state(root).target;
    const foreign = path.join(external, 'foreign');
    fs.mkdirSync(foreign);
    fs.writeFileSync(path.join(foreign, 'value'), 'keep');
    for (const destination of [
        foreign,
        path.join(target, 'nested'),
        'relative',
    ])
        assert.throws(() =>
            relocateDependencies(root, mergeConfig(), destination),
        );
    fs.writeFileSync(path.join(root, LOCK_FILE), 'active');
    assert.throws(
        () =>
            relocateDependencies(
                root,
                mergeConfig(),
                path.join(external, 'deps'),
            ),
        /operation is running/,
    );
    assert.ok(!fs.existsSync(path.join(root, RELOCATION_FILE)));
    assert.equal(sentinel(root), 'preserve me');
    assert.equal(fs.readFileSync(path.join(foreign, 'value'), 'utf8'), 'keep');
    for (const args of [
        ['--relocate'],
        ['--relocate', '--external', '--configured'],
        ['--storage', 'prune'],
        ['--storage', 'register', '--size'],
    ])
        assert.equal(run(root, args).status, 1);
});

test('pending relocation before rename can be recovered despite broken JavaScript config', (t) => {
    inventory(t);
    const root = fixture(t);
    const external = fixture(t);
    dependencies(root);
    migrateDependencies(root, mergeConfig());
    const original = state(root);
    const target = path.join(external, 'deps');
    const rename = fs.renameSync;
    t.mock.method(fs, 'renameSync', (from, to) => {
        if (from === original.target)
            throw new Error('interrupted before rename');
        return rename(from, to);
    });
    assert.throws(
        () => relocateDependencies(root, mergeConfig(), target),
        /journal retained/,
    );
    assert.ok(fs.existsSync(path.join(root, RELOCATION_FILE)));
    assert.ok(fs.existsSync(original.target));
    assert.ok(!fs.existsSync(target));
    t.mock.restoreAll();
    fs.writeFileSync(
        path.join(root, 'fnspm.config.cjs'),
        'throw new Error("broken config")',
    );
    const preview = run(root, [
        '--relocate',
        '--recover',
        '--dry-run',
        '--json',
    ]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.ok(!fs.existsSync(target));
    const recovered = run(root, ['--relocate', '--recover', '--json']);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(state(root).target, target);
    assert.equal(sentinel(root), 'preserve me');
    assert.ok(!fs.existsSync(path.join(root, RELOCATION_FILE)));
});

test('doctor repairs relocation interrupted after moving storage but before creating its link', (t) => {
    inventory(t);
    const root = fixture(t);
    const external = fixture(t);
    dependencies(root);
    migrateDependencies(root, mergeConfig());
    const original = state(root);
    const target = path.join(external, 'deps');
    t.mock.method(fs, 'symlinkSync', () => {
        throw new Error('interrupted link creation');
    });
    assert.throws(
        () => relocateDependencies(root, mergeConfig(), target),
        /journal retained/,
    );
    t.mock.restoreAll();
    assert.equal(state(root).target, original.target);
    assert.ok(fs.existsSync(target));
    assert.match(repairDependencies(root, true), /Complete storage relocation/);
    const env = stub(root);
    const preview = run(root, ['doctor', '--json', '--fix', '--dry-run'], env);
    assert.equal(preview.status, 1);
    assert.equal(
        JSON.parse(preview.stdout).dependencies.state,
        'recovery-needed',
    );
    assert.ok(!fs.existsSync(path.join(root, 'node_modules')));
    const fixed = run(root, ['doctor', '--json', '--fix'], env);
    assert.equal(fixed.status, 0, fixed.stderr);
    const report = JSON.parse(fixed.stdout);
    assert.equal(report.dependencies.state, 'valid');
    assert.equal(report.dependencies.configuredStorage, target);
    assert.equal(state(root).inode, original.inode);
    assert.equal(sentinel(root), 'preserve me');
});

test('relocation recovery is idempotent after preference, state or journal-cleanup failures', (t) => {
    inventory(t);
    for (const failure of ['state', 'cleanup']) {
        const root = fixture(t);
        const external = fixture(t);
        dependencies(root);
        migrateDependencies(root, mergeConfig());
        const target = path.join(external, 'deps');
        const rename = fs.renameSync;
        const unlink = fs.unlinkSync;
        if (failure === 'state')
            t.mock.method(fs, 'renameSync', (from, to) => {
                if (to === path.join(root, STATE_FILE))
                    throw new Error('state interruption');
                return rename(from, to);
            });
        else
            t.mock.method(fs, 'unlinkSync', (file) => {
                if (file === path.join(root, RELOCATION_FILE))
                    throw new Error('cleanup interruption');
                return unlink(file);
            });
        assert.throws(
            () => relocateDependencies(root, mergeConfig(), target),
            /journal retained/,
        );
        t.mock.restoreAll();
        assert.ok(fs.existsSync(path.join(root, RELOCATION_FILE)));
        recoverRelocation(root);
        assert.equal(state(root).target, target);
        assert.equal(sentinel(root), 'preserve me');
        assert.ok(!fs.existsSync(path.join(root, RELOCATION_FILE)));
        assert.ok(
            listStorage()
                .entries.filter((entry) => entry.record?.root === root)
                .every((entry) => entry.status === 'managed'),
        );
        assert.throws(
            () => recoverRelocation(root),
            /Invalid relocation journal/,
        );
    }
});

test('recovery refuses changed storage, conflicting directories, foreign links and substituted metadata', (t) => {
    inventory(t);
    for (const conflict of [
        'both',
        'storage',
        'link',
        'journal',
        'preference',
    ]) {
        const root = fixture(t);
        const external = fixture(t);
        dependencies(root);
        migrateDependencies(root, mergeConfig());
        const original = state(root);
        const target = path.join(external, 'deps');
        const rename = fs.renameSync;
        t.mock.method(fs, 'renameSync', (from, to) => {
            if (from === original.target) throw new Error('pause');
            return rename(from, to);
        });
        assert.throws(
            () => relocateDependencies(root, mergeConfig(), target),
            /journal retained/,
        );
        t.mock.restoreAll();
        if (conflict === 'both') fs.mkdirSync(target);
        if (conflict === 'storage') {
            fs.renameSync(original.target, path.join(external, 'original'));
            fs.mkdirSync(original.target);
            fs.writeFileSync(path.join(original.target, 'foreign'), 'keep');
        }
        if (conflict === 'link')
            directoryLink(external, path.join(root, 'node_modules'));
        if (conflict === 'journal')
            fs.writeFileSync(path.join(root, RELOCATION_FILE), 'null');
        if (conflict === 'preference')
            fs.mkdirSync(path.join(root, STORAGE_FILE));
        const before = fs.readdirSync(root).sort();
        assert.throws(() => recoverRelocation(root));
        assert.deepEqual(fs.readdirSync(root).sort(), before);
        assert.ok(fs.existsSync(path.join(root, RELOCATION_FILE)));
        if (conflict === 'storage')
            assert.equal(
                fs.readFileSync(path.join(original.target, 'foreign'), 'utf8'),
                'keep',
            );
    }
});

test('restore completes a pending relocation before returning native dependencies', (t) => {
    inventory(t);
    const root = fixture(t);
    const external = fixture(t);
    dependencies(root);
    migrateDependencies(root, mergeConfig());
    const target = path.join(external, 'deps');
    t.mock.method(fs, 'symlinkSync', () => {
        throw new Error('pause');
    });
    assert.throws(
        () => relocateDependencies(root, mergeConfig(), target),
        /journal retained/,
    );
    t.mock.restoreAll();
    assert.match(
        restoreDependencies(root, true),
        /after completing relocation/,
    );
    assert.ok(fs.existsSync(path.join(root, RELOCATION_FILE)));
    restoreDependencies(root);
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
    assert.equal(sentinel(root), 'preserve me');
    assert.ok(!fs.existsSync(target));
    assert.ok(!fs.existsSync(path.join(root, STATE_FILE)));
    migrateDependencies(root, mergeConfig());
    assert.equal(state(root).target, target);
});

test(
    'forced process termination retains a recoverable journal and never clears its unknown lock automatically',
    { timeout: 15000 },
    async (t) => {
        inventory(t);
        const root = fixture(t);
        const external = fixture(t);
        dependencies(root);
        migrateDependencies(root, mergeConfig());
        const original = state(root);
        const target = path.join(external, 'deps');
        const checkpoint = path.join(root, 'paused');
        const implementation = path.resolve(
            __dirname,
            '../dist/src/utils/dependencies.js',
        );
        const script = `const fs=require('node:fs'); const move=fs.renameSync;
fs.renameSync=(from,to)=>{if(from===${JSON.stringify(original.target)}){fs.writeFileSync(${JSON.stringify(checkpoint)},'ready'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);} return move(from,to);};
require(${JSON.stringify(implementation)}).relocateDependencies(${JSON.stringify(root)},${JSON.stringify(mergeConfig())},${JSON.stringify(target)});`;
        const child = spawn(process.execPath, ['-e', script], {
            cwd: root,
            env: process.env,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        let errors = '';
        child.stderr.on('data', (chunk) => (errors += chunk));
        const exited = new Promise((resolve) => child.once('exit', resolve));
        t.after(() => {
            if (child.exitCode === null && child.signalCode === null)
                child.kill('SIGKILL');
        });
        const deadline = Date.now() + 5000;
        while (
            !fs.existsSync(checkpoint) &&
            Date.now() < deadline &&
            child.exitCode === null &&
            child.signalCode === null
        )
            await pause(20);
        assert.ok(fs.existsSync(checkpoint), errors);
        child.kill('SIGKILL');
        await exited;
        assert.ok(fs.existsSync(path.join(root, RELOCATION_FILE)));
        assert.equal(
            JSON.parse(fs.readFileSync(path.join(root, LOCK_FILE), 'utf8')).pid,
            child.pid,
        );
        const refused = run(root, ['--relocate', '--recover', '--json']);
        assert.equal(refused.status, 1);
        assert.match(
            JSON.parse(refused.stdout).message,
            /operation is running or was interrupted/,
        );
        assert.equal(
            fs.readFileSync(path.join(original.target, 'sentinel.txt'), 'utf8'),
            'preserve me',
        );
        // This test owns the fixture and has awaited the stopped process; clear only its retained lock.
        fs.unlinkSync(path.join(root, LOCK_FILE));
        const recovered = run(root, ['--relocate', '--recover', '--json']);
        assert.equal(recovered.status, 0, recovered.stderr);
        assert.equal(state(root).target, target);
        assert.equal(sentinel(root), 'preserve me');
        assert.ok(!fs.existsSync(path.join(root, RELOCATION_FILE)));
    },
);

test('existing tracked storage can be explicitly registered without moving dependencies', (t) => {
    const data = inventory(t);
    const root = fixture(t);
    dependencies(root);
    migrateDependencies(root, mergeConfig());
    fs.rmSync(path.join(data, 'registry'), { recursive: true });
    const before = state(root);
    const result = run(root, ['--storage', 'register', '--json']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(state(root), before);
    assert.equal(sentinel(root), 'preserve me');
    assert.equal(listStorage().entries[0].status, 'managed');
    const foreign = fixture(t);
    dependencies(foreign);
    assert.throws(() => registerStorage(foreign), /untracked/);
});

test('configured mode can clear a relocation preference after restoration without moving native dependencies', (t) => {
    inventory(t);
    const root = fixture(t);
    const external = fixture(t);
    dependencies(root);
    migrateDependencies(root, mergeConfig());
    relocateDependencies(root, mergeConfig(), path.join(external, 'deps'));
    restoreDependencies(root);
    assert.ok(fs.existsSync(path.join(root, STORAGE_FILE)));
    assert.match(
        relocateDependencies(root, mergeConfig(), undefined, true),
        /dry-run/,
    );
    assert.ok(fs.existsSync(path.join(root, STORAGE_FILE)));
    relocateDependencies(root, mergeConfig(), undefined);
    assert.ok(!fs.existsSync(path.join(root, STORAGE_FILE)));
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
    assert.equal(sentinel(root), 'preserve me');
});

test('native storage and relocate commands and later flags remain forwarded unchanged', (t) => {
    inventory(t);
    const root = fixture(t);
    config(root, { symlink: { enabled: false } });
    const env = stub(root);
    for (const args of [
        ['storage', 'list'],
        ['relocate', 'example'],
        ['run', 'task', '--storage', 'list'],
        ['run', 'task', '--', '--relocate', '--external'],
    ]) {
        const result = run(root, ['--pm', 'npm', ...args], env);
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(
            JSON.parse(fs.readFileSync(env.ARGS_LOG, 'utf8')).args,
            args,
        );
    }
});
