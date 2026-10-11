# Changelog

## 0.3.0 — 2026-10-01

- Require Node.js 22 or newer; use a single npm development lockfile.
- Preserve native arguments, live terminal output, child exit status and interrupts.
- Load CJS/ESM configurations with strict validation and partial defaults.
- Implement documented initialization flags without overwriting existing config.
- Detect manifest package managers and workspace roots; reject ambiguous locks.
- Replace destructive relocation with collision checks, ownership state, rollback,
  operation locking, and explicit `migrate` / `restore` commands with dry runs.
- Add `doctor` and dedicated external dependency storage with link safety checks.
- Preserve automatic conversion after native commands, including workspace
  sections; only convert local dependencies in the invocation directory.
- Keep per-section initialization/configuration independent; inherit the nearest
  parent config without losing it when local migration state/lockfiles appear.
- Safely adopt matching legacy project-local nosync links without moving their
  dependency files, and handle repeat clean installs.
- Restore and refresh already tracked shared workspace storage when installs
  run from a section, preserving the workspace root's own configuration.
- Build before packaging, ship complete declarations, and avoid CLI side effects
  when importing the package.
- Add regression tests, package installation/type checking, cross-platform CI,
  and scheduled dependency updates.
- Correct cloud-provider support claims and align license documentation with GPL.

### Compatibility notes

- Unknown config settings/options are now rejected rather than silently ignored.
- Multiple lockfile managers require a declaration or explicit override.
- `--no-sync-folder` now disables automatic migration.
- Migration refuses existing destinations instead of deleting them.
- `restore` needs recorded ownership; matching project-local legacy links can be
  adopted using `migrate`, including automatic adoption before clean installs.
- TypeScript is a build dependency, not a peer requirement for CLI users.
