# JavaScript & types

## Importing the package

The top-level module exports `main` and TypeScript declarations. Importing it does not execute the CLI.

```js
const { main } = require('fnspm');
```

An ES module can import the same public function:

```js
import { main } from 'fnspm';
```

FNSPM is primarily a CLI. Calling `main` can still evaluate project configuration, run a native manager, write diagnostics to the terminal, and change dependency storage according to the supplied command.

## main

```ts
main(args?: string[]): Promise<number>
```

With no explicit array, arguments default to `process.argv.slice(2)`. Pass an array when embedding the command flow:

```js
const { main } = require('fnspm');

async function inspectProject() {
    try {
        process.exitCode = await main(['config', '--show', '--json']);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

inspectProject();
```

`main` uses the process's current working directory. It returns a numeric status for completed flows, including diagnostics, and can reject for configuration, native-command, locking, or safety errors. The CLI entry point catches rejected errors and sets its own process exit code.

Do not treat it as an isolated background service API: command execution shares the process's terminal and signal handlers. Supply the expected working directory before invoking it.

## Exported types

```ts
import type {
    Config,
    UserConfig,
    PackageManagerType,
    DetectionMode,
    PackageManagerConfig,
    SymlinkConfig,
    DebugConfig,
} from 'fnspm';
```

| Type                   | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `Config`               | Fully resolved configuration with all defaulted settings               |
| `UserConfig`           | Partial sections and fields accepted by a config file                  |
| `PackageManagerType`   | `'npm'`, `'yarn'`, `'pnpm'`, `'bun'`, or `'deno'`                      |
| `DetectionMode`        | `'auto'`, `'default'`, or a manager name                               |
| `PackageManagerConfig` | Manager fallback and detection fields                                  |
| `SymlinkConfig`        | Conversion, ignore-rule, local-name, and optional external-path fields |
| `DebugConfig`          | Verbose diagnostics field                                              |

Use `UserConfig` when writing configuration rather than requiring every field:

```ts
import type { UserConfig } from 'fnspm';

const config: UserConfig = {
    packageManager: { detection: 'bun' },
    symlink: { enabled: false },
};
```

JavaScript config files can use the same type through JSDoc:

```js
/** @type {import('fnspm').UserConfig} */
const config = { symlink: { nosyncName: 'web.nosync' } };
module.exports = config;
```

## Internal modules and metadata

The package export map exposes the top-level entry point. Do not build an integration around `dist/src` imports, `.fnspm-state.json` fields, or operation-lock internals.

Use the documented commands to inspect and repair layouts. `config --show --json` is the documented machine-readable inspection command, but the internal implementation modules are not public entry points.

## Compatibility contract

The v1 public contract covers documented CLI commands and flags, config fields and resolution rules, and the top-level function and types above. Existing 0.3 config formats, section overrides, native argument forwarding, exit codes, and local conversion remain supported.

Breaking public-interface changes after 1.0 require a new major version. Native managers and cloud clients retain their own independently versioned behavior.
