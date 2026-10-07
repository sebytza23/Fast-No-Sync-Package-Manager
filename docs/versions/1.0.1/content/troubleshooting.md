# Troubleshooting

## Start with inspection

Run these commands from the directory where the problem occurs:

```sh
fnspm config --show
fnspm doctor
```

The first explains configuration and manager selection; the second checks the executable and dependency layout. For safe repair candidates:

```sh
fnspm doctor --fix --dry-run
fnspm doctor --fix
```

A preview is diagnostic, so a nonzero status does not mean that the preview itself wrote anything. Do not delete dependency storage to clear a lock or collision.

## Manager unavailable

**Message:** a manager is not installed or is not on `PATH`.

FNSPM does not install managers. Check the selected manager in `config --show`, then verify that executable in the same terminal:

```sh
bun --version
fnspm doctor --pm bun
```

Install or provision the intended manager through your normal toolchain. A `packageManager` version string selects the manager name; it does not provision that version.

## Multiple package managers detected

**Message:** multiple managers are detected from lockfiles.

Choose the manager explicitly for one command:

```sh
fnspm --pm pnpm install
```

For a lasting decision, declare the intended manager in the project's manifest or configure detection. Review obsolete lockfiles before removing them; they may belong to a separate workflow. FNSPM does not remove them for you.

## Configuration could not load

Check that only one recognized config file exists, it exports an object, and its extension matches the module format. Unknown settings and string-valued booleans are errors.

```js
// Correct boolean value:
module.exports = { symlink: { enabled: false } };
```

Do not use `enabled: 'false'`. See [Configuration](configuration.md) for valid fields.

`fnspm restore` is available without loading the current config. It can return recorded dependencies to the native layout while you correct a config problem, provided ownership and link checks pass.

## Destination already exists

**Message:** the configured storage destination already exists.

FNSPM deliberately refuses to overwrite it. Inspect both the destination and `node_modules`, and establish which directory holds the dependencies you need.

If this is an existing tracked migration and you want a new target, restore first, then edit the config and preview migration again. If the destination is unrelated, choose a different dedicated destination. Do not merge directories by editing migration metadata.

## Storage configuration changed

**Message:** restore before migrating to a new target.

The recorded target differs from the newly configured target. Return the tracked dependencies before starting a new migration:

```sh
fnspm restore --dry-run
fnspm restore
fnspm migrate --dry-run
fnspm migrate
```

Restore reads the recorded ownership rather than trusting the new destination.

## Missing source link with intact storage

If the state identifies an intact owned target, but the `node_modules` link disappeared, supported repair can recreate it:

```sh
fnspm doctor --fix --dry-run
fnspm doctor --fix
```

The repair checks directory identity. If the target is missing or was replaced, FNSPM refuses the repair rather than adopting another directory with the same name.

## Replaced or missing storage

**Messages:** dependency storage is missing, was replaced, or the migration state is inconsistent.

Inspect the recorded target and current dependency paths. Keep any data that needs recovery before taking manual action. A matching filename is not proof of ownership; FNSPM also checks the recorded directory identity.

`doctor --fix` cannot reconstruct missing package files or decide which conflicting directory you intended to keep. If the source dependency directory is already correctly restored after an interruption, identity-checked repair can clean up the remaining state.

## Foreign or untracked symlink

FNSPM refuses to move arbitrary links. A matching, project-local legacy nosync link can be adopted through `migrate`; external, broken, or unrelated untracked links are not automatically adopted.

```sh
fnspm migrate --dry-run
```

If the preview does not establish the expected legacy layout, inspect it manually before attempting recovery. See [Upgrading to v1](upgrading.md).

## Operation lock exists

A lock can mean another FNSPM command is still running, or that a previous operation was interrupted. Workspace sections share root locks, so the competing process may have been started from another package.

Inspect `.fnspm-operation.lock`, including its recorded `pid` and `startedAt`. Confirm the corresponding process is no longer running before manually removing **only the stale lock file**, then rerun `doctor`.

FNSPM does not automatically remove an unknown lock. PID reuse is possible; use the timestamp and process details together. Do not remove the lock while an active operation still owns it.

## Cross-filesystem move or unsafe relative link

External storage must share the project's filesystem. A separate drive or volume cannot be used for the rename-based migration.

A linked package can also contain a relative link that would resolve somewhere else after moving to an external target. Use project-local storage for that layout, or restore and choose a safe destination. The error identifies the link that fails the relocation check.

## No node_modules directory

This can be normal before installation, in Yarn PnP, or in a cache-only Deno project. FNSPM forwards the native command and has no dependency directory to convert.

Do not create an empty dependency directory merely to silence this message. Check the manager's intended layout.

## Native install failed

FNSPM preserves the manager's output and exit status. Tracked storage was restored before a dependency-changing command, and failure leaves the native layout available for inspection.

Fix the native issue, then rerun the command. If the manager succeeds but optional conversion is skipped, run `doctor` and inspect storage separately; successful installation does not prove migration succeeded.
