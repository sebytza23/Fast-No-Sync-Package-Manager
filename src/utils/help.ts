export function displayHelp(): void {
    console.info(`
FNSPM - A Lightweight Wrapper for Package Managers

Description:
    FNSPM executes package manager commands while providing macOS optimization 
    for iCloud sync and automatic package manager detection.

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

Features:
    1. Automatic Detection:
       - Detects package manager based on lock files:
         * package-lock.json -> npm
         * yarn.lock        -> yarn
         * pnpm-lock.yaml   -> pnpm
         * bun.lockb        -> bun
         * deno.lock        -> deno

    2. macOS Optimization:
       - Renames node_modules to node_modules.nosync
       - Creates node_modules symlink pointing to node_modules.nosync
       - Prevents unwanted iCloud syncing

Notes:
    - All package manager commands and flags are passed through directly
    - The tool preserves native package manager behavior
    - Only adds macOS optimization and package manager detection

For more information, visit: https://github.com/yourusername/fnspm
`);
}