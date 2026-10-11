const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const directory = path.join(__dirname, '..', 'tests');
const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.test.cjs'))
    .sort()
    .map((file) => path.join(directory, file));
const inventory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'fnspm-test-registry-'),
);
const result = spawnSync(
    process.execPath,
    ['--test', ...process.argv.slice(2), ...files],
    { stdio: 'inherit', env: { ...process.env, FNSPM_DATA_DIR: inventory } },
);
fs.rmSync(inventory, { recursive: true, force: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
