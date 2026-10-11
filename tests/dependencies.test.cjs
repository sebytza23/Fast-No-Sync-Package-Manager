const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, dependencies, directoryLink } = require('./support.cjs');
const { mergeConfig } = require('../dist/src/utils/config.js');
const {
    migrateDependencies,
    restoreDependencies,
    dependencyTarget,
    addToGitIgnore,
    STATE_FILE,
    LOCK_FILE,
} = require('../dist/src/utils/dependencies.js');

test('migrate and restore preserve files and are repeatable', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    const config = mergeConfig();
    migrateDependencies(root, config);
    assert.ok(fs.lstatSync(source).isSymbolicLink());
    assert.equal(
        fs.readFileSync(path.join(source, 'sentinel.txt'), 'utf8'),
        'preserve me',
    );
    assert.match(migrateDependencies(root, config), /Already linked/);
    restoreDependencies(root);
    assert.ok(fs.lstatSync(source).isDirectory());
    assert.ok(!fs.existsSync(path.join(root, STATE_FILE)));
    assert.ok(!fs.existsSync(path.join(root, 'node_modules.nosync')));
    migrateDependencies(root, config);
    restoreDependencies(root);
    assert.equal(
        fs.readFileSync(path.join(source, 'sentinel.txt'), 'utf8'),
        'preserve me',
    );
});
test('dry runs never mutate project files', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    const before = fs.readdirSync(root).sort();
    assert.match(migrateDependencies(root, mergeConfig(), true), /dry-run/);
    assert.deepEqual(fs.readdirSync(root).sort(), before);
    assert.ok(fs.lstatSync(source).isDirectory());
    migrateDependencies(root, mergeConfig());
    const migrated = fs.readdirSync(root).sort();
    restoreDependencies(root, true);
    assert.deepEqual(fs.readdirSync(root).sort(), migrated);
    assert.ok(fs.lstatSync(source).isSymbolicLink());
});
test('existing destination and foreign links are preserved', (t) => {
    const root = fixture(t);
    dependencies(root);
    const target = path.join(root, 'node_modules.nosync');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'important'), 'keep');
    assert.throws(
        () => migrateDependencies(root, mergeConfig()),
        /already exists/,
    );
    assert.equal(
        fs.readFileSync(path.join(target, 'important'), 'utf8'),
        'keep',
    );
    fs.renameSync(path.join(root, 'node_modules'), path.join(root, 'foreign'));
    directoryLink(path.join(root, 'foreign'), path.join(root, 'node_modules'));
    assert.throws(
        () => migrateDependencies(root, mergeConfig()),
        /foreign symlink/,
    );
    assert.ok(fs.existsSync(path.join(root, 'foreign', 'sentinel.txt')));
});
test('dangling link is diagnosed without deleting it', (t) => {
    const root = fixture(t);
    const source = path.join(root, 'node_modules');
    directoryLink(path.join(root, 'node_modules.nosync'), source);
    assert.throws(
        () => migrateDependencies(root, mergeConfig()),
        /broken symlink/,
    );
    assert.ok(fs.lstatSync(source).isSymbolicLink());
});
test('migration rollback restores original directory if link creation fails', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    t.mock.method(fs, 'symlinkSync', () => {
        throw new Error('injected link failure');
    });
    assert.throws(() => migrateDependencies(root, mergeConfig()), /injected/);
    assert.ok(fs.lstatSync(source).isDirectory());
    assert.ok(fs.existsSync(path.join(source, 'sentinel.txt')));
    assert.ok(!fs.existsSync(path.join(root, STATE_FILE)));
    assert.ok(!fs.existsSync(path.join(root, LOCK_FILE)));
});
test('rollback preserves a source recreated by another process', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    t.mock.method(fs, 'symlinkSync', () => {
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, 'new'), 'new');
        throw new Error('race');
    });
    assert.throws(() => migrateDependencies(root, mergeConfig()), /recreated/);
    assert.ok(
        fs.existsSync(path.join(root, 'node_modules.nosync', 'sentinel.txt')),
    );
    assert.ok(fs.existsSync(path.join(source, 'new')));
    assert.ok(fs.existsSync(path.join(root, STATE_FILE)));
});
test('restore failure reinstates original link', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    migrateDependencies(root, mergeConfig());
    const rename = fs.renameSync;
    t.mock.method(fs, 'renameSync', (from, to) => {
        if (to === source) throw new Error('injected restore failure');
        return rename(from, to);
    });
    assert.throws(() => restoreDependencies(root), /injected/);
    assert.ok(fs.lstatSync(source).isSymbolicLink());
    assert.ok(fs.existsSync(path.join(source, 'sentinel.txt')));
    assert.ok(fs.existsSync(path.join(root, STATE_FILE)));
});
test('interrupted migration missing source recovers from state', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    migrateDependencies(root, mergeConfig());
    fs.unlinkSync(source);
    assert.match(migrateDependencies(root, mergeConfig()), /Recover link/);
    assert.ok(fs.existsSync(path.join(source, 'sentinel.txt')));
});
test('restore works when link is missing and configuration changed', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    migrateDependencies(root, mergeConfig());
    fs.unlinkSync(source);
    restoreDependencies(root);
    assert.ok(fs.lstatSync(source).isDirectory());
});
test('restoration refuses untracked or replaced dependency storage', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    assert.throws(() => restoreDependencies(root), /No FNSPM migration state/);
    migrateDependencies(root, mergeConfig());
    fs.unlinkSync(source);
    fs.mkdirSync(source);
    assert.throws(() => restoreDependencies(root), /replaced/);
    fs.rmdirSync(source);
    directoryLink(path.join(root, 'node_modules.nosync'), source);
    fs.renameSync(
        path.join(root, 'node_modules.nosync'),
        path.join(root, 'original-storage'),
    );
    fs.mkdirSync(path.join(root, 'node_modules.nosync'));
    assert.throws(() => restoreDependencies(root), /replaced/);
    assert.ok(
        fs.existsSync(path.join(root, 'original-storage', 'sentinel.txt')),
    );
});
test('changed target requires restore before remigration', (t) => {
    const root = fixture(t);
    dependencies(root);
    migrateDependencies(root, mergeConfig());
    assert.throws(
        () =>
            migrateDependencies(
                root,
                mergeConfig({ symlink: { nosyncName: 'new.nosync' } }),
            ),
        /restore/,
    );
});
test('operation lock prevents concurrent mutation', (t) => {
    const root = fixture(t);
    dependencies(root);
    fs.writeFileSync(path.join(root, LOCK_FILE), 'running');
    assert.throws(
        () => migrateDependencies(root, mergeConfig()),
        /operation is running or was interrupted/,
    );
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
});
test('dedicated external storage supports migration and restoration', (t) => {
    const root = fixture(t);
    const external = fixture(t);
    dependencies(root);
    const target = path.join(external, 'dependencies');
    migrateDependencies(
        root,
        mergeConfig({ symlink: { storagePath: target } }),
    );
    assert.ok(fs.existsSync(path.join(target, 'sentinel.txt')));
    restoreDependencies(root);
    assert.ok(!fs.existsSync(target));
});
test('external storage rejects workspace links it would break', (t) => {
    const root = fixture(t);
    const external = fixture(t);
    const source = dependencies(root);
    const workspace = path.join(root, 'app');
    fs.mkdirSync(workspace);
    directoryLink(
        process.platform === 'win32' ? workspace : '../app',
        path.join(source, 'app'),
    );
    if (process.platform === 'win32') return; // Junctions are absolute and survive the move.
    assert.throws(
        () =>
            migrateDependencies(
                root,
                mergeConfig({
                    symlink: { storagePath: path.join(external, 'deps') },
                }),
            ),
        /relative link/,
    );
    assert.ok(fs.lstatSync(source).isDirectory());
});
test('internal links and project-local workspace links remain usable', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    fs.mkdirSync(path.join(source, 'package'));
    fs.writeFileSync(path.join(source, 'package', 'data'), 'ok');
    fs.mkdirSync(path.join(root, 'workspace'));
    directoryLink(
        process.platform === 'win32' ? path.join(source, 'package') : 'package',
        path.join(source, 'internal'),
    );
    directoryLink(
        process.platform === 'win32'
            ? path.join(root, 'workspace')
            : '../workspace',
        path.join(source, 'workspace'),
    );
    migrateDependencies(root, mergeConfig());
    assert.equal(
        fs.readFileSync(path.join(source, 'internal', 'data'), 'utf8'),
        'ok',
    );
    assert.ok(fs.statSync(path.join(source, 'workspace')).isDirectory());
});
test('storage cannot overlap project or hide in nested project directory', (t) => {
    const root = fixture(t);
    dependencies(root);
    fs.mkdirSync(path.join(root, 'node_modules', 'inner'));
    for (const storagePath of [
        root,
        path.dirname(root),
        path.join(root, 'node_modules', 'inner'),
        path.join(root, 'valuable'),
    ]) {
        assert.throws(
            () =>
                dependencyTarget(
                    root,
                    mergeConfig({ symlink: { storagePath } }),
                ),
            /storage must/,
        );
    }
});
test('storage parent symlink cannot bypass overlap checks', (t) => {
    const root = fixture(t);
    const external = fixture(t);
    dependencies(root);
    directoryLink(root, path.join(external, 'alias'));
    assert.throws(
        () =>
            dependencyTarget(
                root,
                mergeConfig({
                    symlink: {
                        storagePath: path.join(external, 'alias', 'valuable'),
                    },
                }),
            ),
        /storage must/,
    );
});
test('gitignore created and both dependency paths added independently', (t) => {
    const root = fixture(t);
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\r\n');
    addToGitIgnore(root, mergeConfig());
    const content = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    assert.match(content, /\/node_modules.nosync\//);
    assert.match(content, /\.fnspm-state/);
    addToGitIgnore(root, mergeConfig());
    assert.equal(
        fs.readFileSync(path.join(root, '.gitignore'), 'utf8'),
        content,
    );
});
test('gitignore symlink is not followed', (t) => {
    const root = fixture(t);
    const external = fixture(t);
    const file = path.join(external, 'ignore');
    fs.writeFileSync(file, 'keep');
    if (process.platform === 'win32') return;
    fs.symlinkSync(file, path.join(root, '.gitignore'));
    assert.throws(() => addToGitIgnore(root, mergeConfig()), /regular file/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'keep');
});
test('no node_modules is a harmless no-op', (t) => {
    const root = fixture(t);
    assert.match(migrateDependencies(root, mergeConfig()), /No node_modules/);
    assert.ok(!fs.existsSync(path.join(root, STATE_FILE)));
});
test('cross-filesystem destination rejected before moving files', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    const stat = fs.statSync;
    t.mock.method(fs, 'statSync', (file) => {
        const value = stat(file);
        return file === root
            ? Object.assign(value, { dev: value.dev + 1 })
            : value;
    });
    assert.throws(
        () => migrateDependencies(root, mergeConfig()),
        /same filesystem/,
    );
    assert.ok(fs.lstatSync(source).isDirectory());
    assert.ok(!fs.existsSync(path.join(root, STATE_FILE)));
});
test('absolute links pointing into storage block restoration without mutation', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    migrateDependencies(root, mergeConfig());
    const target = path.join(root, 'node_modules.nosync');
    fs.mkdirSync(path.join(target, 'package'));
    directoryLink(path.join(target, 'package'), path.join(target, 'absolute'));
    assert.throws(() => restoreDependencies(root), /absolute link/);
    assert.ok(fs.lstatSync(source).isSymbolicLink());
    assert.ok(fs.existsSync(path.join(target, 'sentinel.txt')));
});
test('interrupted migration before rename can resume', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    const stats = fs.lstatSync(source, { bigint: true });
    fs.writeFileSync(
        path.join(root, STATE_FILE),
        JSON.stringify({
            version: 1,
            root,
            target: path.join(root, 'node_modules.nosync'),
            device: stats.dev.toString(),
            inode: stats.ino.toString(),
        }),
    );
    migrateDependencies(root, mergeConfig());
    assert.ok(fs.lstatSync(source).isSymbolicLink());
    restoreDependencies(root);
});
test('interrupted restore after rename cleans state without moving anything', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    migrateDependencies(root, mergeConfig());
    fs.unlinkSync(source);
    fs.renameSync(path.join(root, 'node_modules.nosync'), source);
    restoreDependencies(root);
    assert.ok(!fs.existsSync(path.join(root, STATE_FILE)));
    assert.ok(fs.existsSync(path.join(source, 'sentinel.txt')));
});
test('migration state uses lossless filesystem identities', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    const stats = fs.lstatSync(source, { bigint: true });
    migrateDependencies(root, mergeConfig());
    const state = JSON.parse(
        fs.readFileSync(path.join(root, STATE_FILE), 'utf8'),
    );
    assert.equal(state.device, stats.dev.toString());
    assert.equal(state.inode, stats.ino.toString());
});
test('malformed migration metadata never moves dependencies', (t) => {
    for (const state of [null, [], {}, { version: 1, root: 'other' }]) {
        const root = fixture(t);
        const source = dependencies(root);
        fs.writeFileSync(path.join(root, STATE_FILE), JSON.stringify(state));
        assert.throws(
            () => migrateDependencies(root, mergeConfig()),
            /Invalid migration state/,
        );
        assert.ok(fs.lstatSync(source).isDirectory());
    }
});
test('adopt legacy project-local link without moving or deleting dependency files', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    const target = path.join(root, 'node_modules.nosync');
    fs.renameSync(source, target);
    directoryLink(target, source);
    const before = fs.lstatSync(target, { bigint: true }).ino;
    assert.match(migrateDependencies(root, mergeConfig(), true), /dry-run/);
    assert.ok(!fs.existsSync(path.join(root, STATE_FILE)));
    assert.match(migrateDependencies(root, mergeConfig()), /Track existing/);
    assert.equal(fs.lstatSync(target, { bigint: true }).ino, before);
    assert.equal(
        fs.readFileSync(path.join(source, 'sentinel.txt'), 'utf8'),
        'preserve me',
    );
    restoreDependencies(root);
    assert.ok(fs.lstatSync(source).isDirectory());
});
test('custom nosync directory with brackets is actually ignored by Git', (t) => {
    const root = fixture(t);
    dependencies(root);
    const { execFileSync, spawnSync } = require('node:child_process');
    execFileSync('git', ['init', '--quiet', root]);
    migrateDependencies(
        root,
        mergeConfig({ symlink: { nosyncName: 'cache[local].nosync' } }),
    );
    const ignored = spawnSync(
        'git',
        ['check-ignore', '--quiet', 'cache[local].nosync/sentinel.txt'],
        { cwd: root },
    );
    assert.equal(ignored.status, 0, ignored.stderr?.toString());
});
