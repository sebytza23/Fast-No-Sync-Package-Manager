# Configuration

## Supported files

Keep **one** configuration file per configured directory:

| File               | Module format                                     |
| ------------------ | ------------------------------------------------- |
| `fnspm.config.cjs` | CommonJS, regardless of the package's module type |
| `fnspm.config.mjs` | ES module                                         |
| `fnspm.config.js`  | Follows the project's `package.json#type`         |

`fnspm initialize` writes `.mjs` when the current manifest declares `"type": "module"`; otherwise it writes `.cjs`. A config file exports an object, and may specify only the settings you want to change.

Configuration executes as JavaScript. Load it only from projects you trust.

## A complete CommonJS configuration

```js
/** @type {import('fnspm').UserConfig} */
const config = {
    packageManager: {
        default: 'npm',
        detection: 'auto',
    },
    symlink: {
        enabled: true,
        addToGitIgnore: true,
        nosyncName: 'node_modules.nosync',
    },
    debug: {
        verbose: false,
    },
};

module.exports = config;
```

These are the built-in defaults. Omitted fields receive these values.

For ES modules, keep the object and replace the final line with:

```js
export default config;
```

## Every setting

| Setting                    | Default                 | Meaning                                                                                 |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `packageManager.default`   | `'npm'`                 | Fallback manager, or the chosen manager when detection is `'default'`                   |
| `packageManager.detection` | `'auto'`                | `'auto'`, `'default'`, or one of `'npm'`, `'yarn'`, `'pnpm'`, `'bun'`, `'deno'`         |
| `symlink.enabled`          | `true`                  | Convert local dependencies after eligible successful native commands                    |
| `symlink.addToGitIgnore`   | `true`                  | Add ignore rules during migration and supported repairs                                 |
| `symlink.nosyncName`       | `'node_modules.nosync'` | A single safe directory name inside the project                                         |
| `symlink.storagePath`      | Not set                 | Absolute path to a dedicated external destination; takes precedence over the local name |
| `debug.verbose`            | `false`                 | Print the command and migration diagnostics                                             |

Booleans must be actual JavaScript `true` or `false`, not strings. Unknown sections and unknown settings are rejected. Names containing path separators, reserved metadata names, or invalid Windows filename characters are rejected.

`storagePath` must be absolute. Its parent must already exist on the same filesystem, and the destination must be dedicated to this project. See [Dependency storage](storage.md).

## Selecting a manager deliberately

To always use Bun unless the current command supplies `--pm`:

```js
module.exports = {
    packageManager: { detection: 'bun' },
};
```

To always use the configured fallback:

```js
module.exports = {
    packageManager: { default: 'pnpm', detection: 'default' },
};
```

Setting only `default: 'pnpm'` does **not** override a manager declared in the manifest when detection remains `'auto'`.

## How configuration is resolved

FNSPM searches upward for the nearest configuration, stopping at a Git boundary. A directory without its own config can inherit a parent's config. A nested Git repository creates a new boundary.

A section config overrides the parent config **as a whole**. FNSPM merges the selected file with built-in defaults, not with the parent's settings.

Suppose the root config sets Bun and disables conversion. If `packages/web/fnspm.config.cjs` contains only:

```js
module.exports = {
    symlink: { nosyncName: 'web.nosync' },
};
```

Then that section uses automatic detection, npm as the fallback, and **enabled** conversion. Those values come from the built-in defaults. Repeat a parent's settings in the section if you want to keep them.

A local migration state file or generated section lockfile does not discard an otherwise inherited parent config. Project detection and config lookup are separate operations.

## Inspect effective values and their origins

```sh
fnspm config --show
fnspm config --show --json
fnspm config --show --pm pnpm
```

The JSON report contains `cwd`, `projectRoot`, `dependencyRoot`, `configurationFile`, `config`, `origins`, `packageManager`, and `dependencyStorage`.

`origins` maps setting names such as `symlink.enabled` to the config file or `built-in default`. The `packageManager` object contains its `name`, selection `reason`, and detection `root`.

A CLI `--pm` override changes the manager chosen for the report; it does not rewrite your configuration.

## Disabling future conversion

Edit the chosen config:

```js
module.exports = {
    symlink: { enabled: false },
};
```

If dependencies are already converted, run `fnspm restore` to return them immediately. A later dependency-changing command through FNSPM also restores tracked local storage before execution, even when conversion is disabled. Native commands such as `run` do not necessarily trigger that restoration.

## Initialization options

`initialize` and `init-config` accept the same options. Supplying any options selects noninteractive initialization; use no options for the terminal wizard.

| Option                                        | Effect                                                          |
| --------------------------------------------- | --------------------------------------------------------------- |
| `--default`, `-d`                             | Write defaults without prompts; other options can override them |
| `--pm <manager>`                              | Set `packageManager.default`                                    |
| `--detection <mode>`                          | Set the detection mode                                          |
| `--symlink`, `--no-symlink`                   | Enable or disable conversion                                    |
| `--no-sync-folder`                            | Alias for `--no-symlink`                                        |
| `--sync-folder <name>`                        | Set the local storage name                                      |
| `--storage-path <absolute-path>`              | Set external storage                                            |
| `--add-to-gitignore`, `--no-add-to-gitignore` | Control generated ignore rules                                  |
| `--verbose`, `--no-verbose`                   | Control command diagnostics                                     |

Legacy boolean forms, such as `--symlink true` and `--verbose false`, remain supported. Existing configs are never overwritten by initialization; edit the file instead.
