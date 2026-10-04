const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.resolve(__dirname, '../dist/index.js');
function fixture(t, manifest = {}) {
    const root = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'fnspm-test-')),
    );
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}
function config(root, value, extension = 'cjs') {
    fs.writeFileSync(
        path.join(root, `fnspm.config.${extension}`),
        `${extension === 'mjs' ? 'export default' : 'module.exports ='} ${JSON.stringify(value)};`,
    );
}
function dependencies(root) {
    const dir = path.join(root, 'node_modules');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'sentinel.txt'), 'preserve me');
    return dir;
}
function stub(root) {
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(
        path.join(bin, 'package.json'),
        JSON.stringify({ type: 'commonjs' }),
    );
    const script = path.join(bin, 'stub.cjs');
    fs.writeFileSync(
        script,
        `const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.ARGS_LOG) fs.writeFileSync(process.env.ARGS_LOG, JSON.stringify({args, cwd:process.cwd()}));
if (process.env.STUB_OUTPUT) { process.stdout.write('x'.repeat(Number(process.env.STUB_OUTPUT))); process.stderr.write('stderr kept'); }
else console.log(args.includes('--version') ? '1.0.0' : JSON.stringify(args));
process.exitCode = Number(process.env.STUB_EXIT || 0);
`,
    );
    for (const manager of ['npm', 'yarn', 'pnpm', 'bun', 'deno']) {
        if (process.platform === 'win32')
            fs.writeFileSync(
                path.join(bin, manager + '.cmd'),
                `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`,
            );
        else {
            const file = path.join(bin, manager);
            fs.writeFileSync(
                file,
                `#!${process.execPath}\nrequire(${JSON.stringify(script)});\n`,
            );
            fs.chmodSync(file, 0o755);
        }
    }
    return {
        ...process.env,
        PATH: bin + path.delimiter + process.env.PATH,
        ARGS_LOG: path.join(root, 'args.json'),
    };
}
function run(root, args, env = process.env) {
    return spawnSync(process.execPath, [cli, ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 5 * 1024 * 1024,
    });
}
function directoryLink(target, file) {
    fs.symlinkSync(
        target,
        file,
        process.platform === 'win32' ? 'junction' : 'dir',
    );
}
module.exports = {
    fixture,
    config,
    dependencies,
    stub,
    run,
    directoryLink,
    cli,
};
