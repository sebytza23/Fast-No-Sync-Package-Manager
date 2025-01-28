export function displayHelp(): void {
    console.info(`
FNSPM - A Lightweight Wrapper for Package Managers

Description:
    FNSPM executes package manager commands while providing macOS optimization 
    for iCloud sync and automatic package manager detection.

Start:
    fnspm initialization <options>

Initilization Options:
    --default, -d    Use default configuration
    --pm            Set default package manager (npm|yarn|pnpm|bun|deno)
    --detection     Set detection mode (auto|default|npm|yarn|pnpm|bun|deno)
    --symlink       Enable/disable symlink creation (true|false)
    --no-symlink    Disable symlink creation
    --sync-folder        Set nosync folder name
    --no-sync-folder    Disable nosync folder creation
    --add-to-gitignore       Add nosync folder to .gitignore
    --no-add-to-gitignore    Disable adding nosync folder to .gitignore
    --verbose       Enable verbose logging (true|false)
    --no-verbose    Disable verbose logging

Usage:
    fnspm [--pm <package-manager>] <command> [...args]

Package Managers Supported:
    - npm
    - yarn
    - pnpm
    - bun
    - deno
    
Options:
    --pm          Specify the package manager to use
    --debug       Enable debug mode

Examples:
    # Using auto-detected package manager
    fnspm install
    fnspm add lodash
    fnspm install --save-dev typescript

    # Specifying package manager
    fnspm --pm yarn add lodash
    fnspm --pm npm install express --save-dev

    # Initialize FNSPM
    fnspm

Features:
    1. Automatic Detection:
       - Detects package manager based on lock files:
         * package-lock.json -> npm
         * yarn.lock        -> yarn
         * pnpm-lock.yaml   -> pnpm
         * bun.(lockb|lock) -> bun
         * deno.lock        -> deno

    2. macOS Optimization:
       - Renames node_modules to node_modules.nosync
       - Creates node_modules symlink pointing to node_modules.nosync
       - Prevents unwanted iCloud syncing

Notes:
    - All package manager commands and flags are passed through directly
    - The tool preserves native package manager behavior
    - Only adds macOS optimization and package manager detection
`);
}