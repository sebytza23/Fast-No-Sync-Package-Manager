# CLI reference

## General invocation

```sh
fnspm [--pm <manager>] [--debug] <command> [...native arguments]
```

`--pm` accepts `npm`, `yarn`, `pnpm`, `bun`, or `deno`, including `--pm=bun`. It applies to this invocation only and may be supplied once. `--debug` enables command diagnostics without editing config.

Wrapper flags are removed before forwarding. Arguments after the `--` separator are preserved, including flags that look like FNSPM options:

```sh
fnspm --debug --pm npm run build
fnspm --pm npm run build -- --debug
```

The first command enables FNSPM diagnostics. The second forwards `--debug` to the native script. Quoted arguments retain their boundaries; FNSPM does not concatenate them into an application-generated shell command.

## help and version

```sh
fnspm
fnspm help
fnspm --help
fnspm -h
fnspm --version
fnspm -v
```

No arguments show help. Help and version work without evaluating the project's configuration or running a package manager.

## initialize and init-config

```sh
fnspm initialize
fnspm initialize --default
fnspm init-config --pm pnpm --detection default --no-symlink
```

Without options, initialization requires an interactive terminal. With options, it writes validated configuration noninteractively into the current directory. Existing config files are never overwritten.

See [Configuration](configuration.md) for all initialization flags, defaults, CJS/ESM formats, and section resolution.

`fnspm init` is forwarded to the native manager. It is not an alias for FNSPM initialization.

## config --show

```sh
fnspm config --show
fnspm config --show --json
fnspm config --show --pm pnpm
```

Print the effective configuration, each setting's origin, invocation/project/dependency roots, manager selection reason, and configured storage path. `--json` emits the same information as JSON.

Inspection evaluates the selected config but does not run a native manager or write project files. Its supported native-looking arguments are `--show` and `--json`; `--pm` is parsed as a wrapper flag.

Other native config commands remain forwarded:

```sh
fnspm --pm npm config get registry
```

## doctor

```sh
fnspm doctor
fnspm doctor --pm bun
fnspm doctor --fix --dry-run
fnspm doctor --fix
```

Plain `doctor` is read-only. It reports the available manager version, local layout, configured target, migration state, operation locks, and ignore-rule issues. It returns a nonzero status for diagnosed errors; warnings alone do not necessarily cause failure.

`--fix --dry-run` previews supported repairs without writing. It can still return a nonzero diagnostic status because the problem remains until applied. `--dry-run` alone is not accepted for `doctor`.

`--fix` validates the plan before writing, applies ownership-checked repairs, and runs the normal health checks. It can recreate a missing tracked link, clean up completed restoration metadata, and add missing ignore rules. It does not remove unknown locks or overwrite conflicting directories.

See [Troubleshooting](troubleshooting.md) for the repair workflow and error-specific guidance.

## migrate

```sh
fnspm migrate --dry-run
fnspm migrate
```

Inspect or apply migration to an existing dependency directory. Migration uses the selected configuration and refuses unsafe paths, existing destinations, foreign links, cross-filesystem moves, and links that would be broken by relocation.

It can also record ownership for a matching legacy project-local nosync link. See [Upgrading to v1](upgrading.md).

Only `--dry-run` is accepted as an additional argument to this command. Use configuration to choose the target.

## restore

```sh
fnspm restore --dry-run
fnspm restore
```

Inspect or restore dependencies with recorded FNSPM ownership. The command uses the recorded migration location and remains available even when the current config is invalid or has changed.

It refuses untracked links, replaced storage, conflicting dependency entries, or link layouts that cannot be restored safely. Only `--dry-run` is accepted as an additional argument.

Restoration does not remove config or disable future automatic conversion.

## Reserved command names

FNSPM owns `help`, `initialize`, `init-config`, `doctor`, `migrate`, and `restore`. These command names cannot be forwarded to a manager through the wrapper. Use the manager directly if its own command collides with a reserved name.

Only the `config --show` form is reserved for inspection. Other `config` commands use the manager's own implementation.

## Exit codes and terminal behavior

| Outcome                                        | Behavior                                                       |
| ---------------------------------------------- | -------------------------------------------------------------- |
| Native command succeeds                        | Return `0`; optionally convert eligible dependencies           |
| Native command fails                           | Preserve its exit code; do not perform post-success conversion |
| Native process ends from a signal              | Forward interrupts and report a signal-derived failure status  |
| FNSPM configuration, lock, or safety error     | Return a nonzero wrapper error, normally `1`                   |
| Optional conversion fails after native success | Print a diagnostic and preserve native success                 |
| doctor identifies errors                       | Return `1`; previews can remain nonzero                        |

Native stdout, stderr, and terminal input are streamed directly. SIGINT and SIGTERM are forwarded to the child process. Native global, redirected, dry-run, and help/version commands retain their conversion exclusions.
