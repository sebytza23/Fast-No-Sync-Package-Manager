# Getting started

## Before you install

You need Node.js **22 or newer** and the package manager you intend to use. FNSPM does not download a manager or enforce the version written in `package.json#packageManager`.

Check your environment:

```sh
node --version
npm --version
```

If you use pnpm, Yarn, Bun, or Deno, check that manager's version too. `fnspm doctor` reports the executable FNSPM can actually find.

## Install the CLI

```sh
npm install -g fnspm
fnspm --version
fnspm --help
```

The current documented release is **{{version}}**. To install that exact release instead of following npm's `latest` tag:

```sh
npm install -g fnspm@{{version}}
```

Global installation makes the command available across projects. Configuration and dependency storage still belong to each project or section.

## Inspect a project first

Open a terminal in the directory where you normally run your manager.

```sh
cd path/to/your-project
fnspm config --show
fnspm doctor
```

`config --show` explains the selected manager, the configuration file, the source of each setting, and the configured storage destination. It does not run a manager command.

`doctor` checks the available manager and local dependency layout. An absent `node_modules` directory is normal before installation, and for Yarn PnP or cache-only Deno projects.

If several manager lockfiles exist and the project has no explicit declaration, choose the intended manager with `--pm`, or resolve the ambiguity in the project. See [Package managers](package-managers.md).

## Run your first install

```sh
fnspm install
```

FNSPM selects the manager and forwards `install`. After a successful command, it converts the current directory's local `node_modules` when conversion is enabled and the layout can be moved safely.

To select npm for one command:

```sh
fnspm --pm npm install
```

Use each manager's own command vocabulary. For example, add a package with `fnspm --pm pnpm add lodash`, rather than expecting FNSPM to translate an npm command into pnpm syntax.

## Create configuration when you need it

Initialization is optional. Run the interactive wizard in a terminal:

```sh
fnspm initialize
```

Or write defaults without prompts:

```sh
fnspm initialize --default
```

For a project that should use pnpm and keep a regular dependency directory:

```sh
fnspm initialize --pm pnpm --detection default --no-symlink
```

Initialization writes in the current directory and refuses to overwrite an existing configuration. `--pm` sets the fallback manager; `--detection default` makes that fallback the selection rule. Without the detection flag, a manifest or lockfile can select another manager.

## Verify and reverse the result

```sh
fnspm doctor
fnspm restore --dry-run
fnspm restore
```

Restoration applies only to dependencies with recorded FNSPM ownership. It is not a general-purpose command for moving arbitrary symlinks. If the project was never converted, there may be no state to restore.

After restoration, your configuration still enables future conversion unless you change it. To keep the native layout, set `symlink.enabled` to `false`. See [Configuration](configuration.md).
