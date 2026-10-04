const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, config } = require('./support.cjs');
const {
    loadConfig,
    mergeConfig,
    validateConfig,
} = require('../dist/src/utils/config.js');
const {
    processCliArgs,
    createConfigFile,
} = require('../dist/src/utils/initialize.js');

for (const extension of ['cjs', 'mjs', 'js'])
    test(`load ${extension} config and merge partial settings`, async (t) => {
        const root = fixture(t);
        config(
            root,
            { symlink: { enabled: false }, packageManager: { default: 'bun' } },
            extension,
        );
        const loaded = await loadConfig(root);
        assert.equal(loaded.symlink.enabled, false);
        assert.equal(loaded.symlink.nosyncName, 'node_modules.nosync');
        assert.equal(loaded.packageManager.default, 'bun');
    });
test('load ESM .js in type:module project', async (t) => {
    const root = fixture(t, { type: 'module' });
    fs.writeFileSync(
        path.join(root, 'fnspm.config.js'),
        'export default {debug:{verbose:true}}',
    );
    assert.equal((await loadConfig(root)).debug.verbose, true);
});
test('load ESM config containing top-level await', async (t) => {
    const root = fixture(t);
    fs.writeFileSync(
        path.join(root, 'fnspm.config.mjs'),
        'await Promise.resolve(); export default {symlink:{enabled:false}}',
    );
    assert.equal((await loadConfig(root)).symlink.enabled, false);
});
test('invalid config aborts instead of falling back', async (t) => {
    const root = fixture(t);
    config(root, { symlink: { enabled: 'false' } });
    await assert.rejects(loadConfig(root), /must be a boolean/);
});
test('syntax errors and duplicate config files abort', async (t) => {
    const root = fixture(t);
    fs.writeFileSync(path.join(root, 'fnspm.config.cjs'), 'module.exports = {');
    await assert.rejects(loadConfig(root), /Could not load/);
    config(root, {}, 'mjs');
    await assert.rejects(loadConfig(root), /Multiple/);
});
test('unknown and malformed config settings rejected', async (t) => {
    for (const value of [
        { symlink: null },
        { debug: { verbsoe: true } },
        { other: {} },
        [],
    ]) {
        const root = fixture(t);
        config(root, value);
        await assert.rejects(loadConfig(root));
    }
});
test('initialization supports manager, detection, flags and independent defaults', () => {
    const value = processCliArgs([
        '--default',
        '--pm',
        'bun',
        '--detection',
        'default',
        '--no-sync-folder',
        '--verbose',
    ]);
    assert.equal(value.packageManager.default, 'bun');
    assert.equal(value.packageManager.detection, 'default');
    assert.equal(value.symlink.enabled, false);
    assert.equal(value.debug.verbose, true);
    assert.equal(mergeConfig().symlink.enabled, true);
    assert.equal(mergeConfig().packageManager.default, 'npm');
});
test('initialization rejects missing, invalid and unknown arguments', () => {
    for (const args of [
        ['--pm'],
        ['--pm', 'bogus'],
        ['--sync-folder'],
        ['--sync-folder', '../data'],
        ['--detection', 'bogus'],
        ['--wat'],
    ]) {
        assert.throws(() => processCliArgs(args));
    }
});
test('validate paths and falsy booleans', () => {
    for (const nosyncName of [
        'node_modules',
        'NODE_MODULES',
        '.git',
        '..',
        '../data',
        'data/foo',
        'data\\foo',
    ]) {
        assert.throws(() =>
            validateConfig(mergeConfig({ symlink: { nosyncName } })),
        );
    }
    for (const enabled of [0, null, 'false'])
        assert.throws(() =>
            validateConfig(mergeConfig({ symlink: { enabled } })),
        );
    assert.throws(() =>
        validateConfig(
            mergeConfig({ symlink: { storagePath: 'relative/path' } }),
        ),
    );
});
test('initialize writes typed ESM config and refuses overwriting', (t) => {
    const root = fixture(t, { type: 'module' });
    const file = createConfigFile(root, mergeConfig());
    assert.equal(path.extname(file), '.mjs');
    assert.match(fs.readFileSync(file, 'utf8'), /UserConfig/);
    assert.throws(
        () => createConfigFile(root, mergeConfig()),
        /already exists/,
    );
});
test('legacy complete configs retain every setting and custom directory name', async (t) => {
    for (const extension of ['cjs', 'mjs', 'js']) {
        const root = fixture(t);
        const legacy = {
            packageManager: { default: 'bun', detection: 'default' },
            symlink: {
                enabled: true,
                addToGitIgnore: false,
                nosyncName: 'dependențe locale.nosync',
            },
            debug: { verbose: true },
        };
        config(root, legacy, extension);
        assert.deepEqual(await loadConfig(root), legacy);
    }
});
test('closest section config overrides parent without leaking into siblings', async (t) => {
    const root = fixture(t);
    config(root, {
        packageManager: { default: 'pnpm', detection: 'default' },
        symlink: { enabled: false },
    });
    const section = path.join(root, 'web');
    const sibling = path.join(root, 'api');
    fs.mkdirSync(section);
    fs.mkdirSync(sibling);
    config(section, {
        packageManager: { default: 'bun', detection: 'default' },
        symlink: { nosyncName: '.web.nosync' },
    });
    assert.equal((await loadConfig(section)).packageManager.default, 'bun');
    assert.equal((await loadConfig(section)).symlink.enabled, true);
    assert.equal((await loadConfig(sibling)).packageManager.default, 'pnpm');
    assert.equal((await loadConfig(sibling)).symlink.enabled, false);
});
test('legacy initialization boolean values remain supported', () => {
    const config = processCliArgs([
        '--pm',
        'BUN',
        '--symlink',
        'false',
        '--verbose',
        'false',
        '--add-to-gitignore',
        'true',
    ]);
    assert.equal(config.packageManager.default, 'bun');
    assert.equal(config.symlink.enabled, false);
    assert.equal(config.debug.verbose, false);
    assert.equal(config.symlink.addToGitIgnore, true);
    assert.equal(
        processCliArgs(['--symlink', 'true', '--verbose', 'true']).debug
            .verbose,
        true,
    );
});
