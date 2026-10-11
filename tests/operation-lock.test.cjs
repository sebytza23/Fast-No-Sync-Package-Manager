const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const {
    fixture,
    config,
    dependencies,
    stub,
    run,
    cli,
} = require('./support.cjs');
const {
    LOCK_FILE,
    withOperationLock,
    withOperationLocks,
} = require('../dist/src/utils/operation-lock.js');

async function holdInstall(t, root, env, stubRoot = root) {
    const ready = path.join(stubRoot, 'ready');
    const release = path.join(stubRoot, 'release');
    fs.writeFileSync(
        path.join(stubRoot, 'bin', 'stub.cjs'),
        `
        const fs=require('node:fs');
        if(process.argv.includes('--version')) {console.log('1.0.0');process.exit(0);}
        fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid));
        const timer=setInterval(()=>{
            if(fs.existsSync(${JSON.stringify(release)})) {clearInterval(timer);process.exit(0);}
        }, 25);
        setTimeout(()=>process.exit(9), 12000).unref();
    `,
    );
    const child = spawn(process.execPath, [cli, '--pm', 'npm', 'install'], {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (data) => (stderr += data));
    const completed = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => resolve(code));
    });
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
            if (fs.existsSync(stubRoot)) fs.writeFileSync(release, 'done');
            else child.kill('SIGTERM');
        }
        await completed;
    });
    for (let attempt = 0; attempt < 320 && !fs.existsSync(ready); attempt++) {
        if (child.exitCode !== null) break;
        await delay(25);
    }
    assert.ok(fs.existsSync(ready), stderr || 'native install never started');
    return { child, completed, ready, release };
}

test('native install holds its lock until completion and blocks concurrent commands', async (t) => {
    const root = fixture(t);
    dependencies(root);
    const env = stub(root);
    const held = await holdInstall(t, root, env);
    assert.ok(fs.existsSync(path.join(root, LOCK_FILE)));
    const pid = fs.readFileSync(held.ready, 'utf8');
    for (const args of [
        ['--pm', 'npm', 'install'],
        ['migrate'],
        ['doctor', '--pm', 'npm', '--fix'],
    ]) {
        const result = run(root, args, env);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr + result.stdout, /operation is running/);
        assert.equal(
            fs.readFileSync(held.ready, 'utf8'),
            pid,
            'a second manager started',
        );
    }
    fs.writeFileSync(held.release, 'done');
    assert.equal(await held.completed, 0);
    assert.ok(!fs.existsSync(path.join(root, LOCK_FILE)));
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink());
});

test('section install also locks untracked shared storage and excludes sibling installs', async (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    dependencies(root);
    const env = stub(root);
    const sections = ['web', 'api'].map((name) =>
        path.join(root, 'packages', name),
    );
    for (const section of sections) {
        fs.mkdirSync(section, { recursive: true });
        fs.writeFileSync(path.join(section, 'package.json'), '{}');
        config(section, { symlink: { enabled: false } });
    }
    const held = await holdInstall(t, sections[0], env, root);
    assert.ok(fs.existsSync(path.join(root, LOCK_FILE)));
    for (const cwd of [root, sections[1]]) {
        const result = run(cwd, ['--pm', 'npm', 'ci'], env);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /operation is running/);
    }
    fs.writeFileSync(held.release, 'done');
    assert.equal(await held.completed, 0);
    for (const cwd of [root, ...sections])
        assert.ok(!fs.existsSync(path.join(cwd, LOCK_FILE)));
    assert.ok(fs.lstatSync(path.join(root, 'node_modules')).isDirectory());
});

test('failed and missing native managers release operation locks', (t) => {
    const root = fixture(t);
    config(root, { symlink: { enabled: false } });
    const env = stub(root);
    env.STUB_EXIT = '7';
    assert.equal(run(root, ['--pm', 'npm', 'install'], env).status, 7);
    assert.ok(!fs.existsSync(path.join(root, LOCK_FILE)));
    assert.equal(
        run(root, ['--pm', 'npm', 'install'], {
            ...env,
            PATH: path.join(root, 'empty'),
        }).status,
        1,
    );
    assert.ok(!fs.existsSync(path.join(root, LOCK_FILE)));
});

test(
    'termination forwards the signal and releases a native-install lock',
    { skip: process.platform === 'win32' },
    async (t) => {
        const root = fixture(t);
        const held = await holdInstall(t, root, stub(root));
        held.child.kill('SIGTERM');
        assert.equal(await held.completed, 143);
        assert.ok(!fs.existsSync(path.join(root, LOCK_FILE)));
    },
);

test('async lock ownership is reentrant only inside the owning operation', async (t) => {
    const root = fixture(t);
    let unblock;
    const blocked = new Promise((resolve) => (unblock = resolve));
    const first = withOperationLocks([root], async () => {
        await delay(1);
        withOperationLock(root, () =>
            assert.ok(fs.existsSync(path.join(root, LOCK_FILE))),
        );
        await blocked;
    });
    await assert.rejects(
        withOperationLocks([root], async () => {}),
        /operation is running/,
    );
    unblock();
    await first;
    assert.ok(!fs.existsSync(path.join(root, LOCK_FILE)));
});

test('partial workspace lock acquisition releases locks without running the command', async (t) => {
    const base = fixture(t);
    const roots = ['a', 'b'].map((name) => path.join(base, name));
    roots.forEach((root) => fs.mkdirSync(root));
    fs.writeFileSync(path.join(roots[1], LOCK_FILE), 'foreign');
    let ran = false;
    await assert.rejects(
        withOperationLocks(roots, async () => (ran = true)),
        /operation is running/,
    );
    assert.equal(ran, false);
    assert.ok(!fs.existsSync(path.join(roots[0], LOCK_FILE)));
    assert.equal(
        fs.readFileSync(path.join(roots[1], LOCK_FILE), 'utf8'),
        'foreign',
    );
});

test('releasing a lock never deletes a replacement created by another process', (t) => {
    const root = fixture(t);
    withOperationLock(root, () => {
        fs.renameSync(path.join(root, LOCK_FILE), path.join(root, 'held-lock'));
        fs.writeFileSync(path.join(root, LOCK_FILE), 'replacement');
    });
    assert.equal(
        fs.readFileSync(path.join(root, LOCK_FILE), 'utf8'),
        'replacement',
    );
});
