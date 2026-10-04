const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const directory = path.join(__dirname, '..', 'tests');
const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.test.cjs'))
    .sort()
    .map((file) => path.join(directory, file));
const result = spawnSync(
    process.execPath,
    ['--test', ...process.argv.slice(2), ...files],
    { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
