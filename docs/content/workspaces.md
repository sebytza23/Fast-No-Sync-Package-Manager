# Projects & workspaces

## The invocation directory matters

FNSPM runs the native command in the directory from which you invoked it. Config lookup may reach a parent, and manager detection may use a workspace root, but those lookups do not move execution into a different package.

For example:

```sh
cd packages/web
fnspm install
```

The manager receives `install` from `packages/web`. It then applies its own workspace and hoisting rules.

## Recognizing project boundaries

FNSPM looks upward for project markers such as a configuration file, a recognized lockfile, `pnpm-workspace.yaml`, Deno configuration, or a manifest declaring workspaces. Search stops at a Git boundary.

A nested project with its own root marker can be detected independently. Config lookup separately selects the closest config. To inspect both decisions:

```sh
fnspm config --show
```

Read the invocation directory, project/detection root, dependency directory, and configuration path together. They need not all be the same directory.

## Root settings with section overrides

Consider this example layout:

```text
repository/
  package.json
  pnpm-workspace.yaml
  fnspm.config.cjs
  packages/
    web/
      package.json
      fnspm.config.cjs
    api/
      package.json
```

The root config selects pnpm:

```js
module.exports = {
    packageManager: { default: 'pnpm', detection: 'default' },
    symlink: { nosyncName: 'root.nosync' },
};
```

The web section keeps the same manager and uses its own local storage name:

```js
module.exports = {
    packageManager: { default: 'pnpm', detection: 'default' },
    symlink: { nosyncName: 'web.nosync' },
};
```

The API section has no config, so it inherits the root config. The web config repeats the manager fields deliberately: section configs replace parent configs and receive defaults for omitted fields.

You can initialize from inside a section without overwriting the root config:

```sh
cd packages/web
fnspm initialize --pm pnpm --detection default --sync-folder web.nosync
```

Use this command when that section does not already have a config.

## Local conversion and shared dependencies

Automatic conversion manages the invocation directory's own `node_modules`. It does not start managing an untracked ancestor or a sibling package.

An install from a section can still cause the native manager to replace shared root dependencies. If FNSPM already tracks the root's storage, it restores that storage before the dependency command, then converts it again after success using the **root's own configuration**.

| Location                       | What FNSPM does during a section install                                          |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Section's local dependencies   | Restore tracked storage before the command; convert after success if enabled      |
| Already tracked workspace root | Restore before the command; convert after success with the root config if enabled |
| Untracked workspace root       | Leave its dependency layout to the native manager                                 |
| Sibling section                | Do not begin managing its dependency directory                                    |

If a section has no local `node_modules`, there may be nothing to convert there. That is normal for managers that hoist dependencies or use PnP.

## Native filters and workspace options

FNSPM preserves these arguments and recognizes the dependency operation even when common native options precede it:

```sh
fnspm --pm npm --workspace web ci
fnspm --pm pnpm --filter web install --frozen-lockfile
fnspm --pm pnpm recursive install
fnspm --pm yarn workspace web add lodash
```

Workspace names and filters must match your actual project. FNSPM does not translate them between managers or define what a manager's filter selects.

## Concurrent commands

Dependency-changing commands lock their local scope and workspace ancestors before executing, including untracked shared roots. Eligible automatic conversion also runs under operation locks.

If two sections belong to the same workspace, their installs can conflict through the shared root. The second FNSPM command fails promptly rather than running another manager against that scope. Independent project trees remain independent.

Run concurrent installations through the manager directly only if you accept that those commands do not participate in FNSPM locking.

## Choosing storage for linked packages

Project-local storage retains the directory depth of `node_modules`, which is useful for workspace links. An external destination may change where relative links resolve.

FNSPM checks those links before moving dependencies and refuses a move that would break them. Choose project-local storage when workspace or linked-package dependencies require it. See [Dependency storage](storage.md).
