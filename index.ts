#!/usr/bin/env node

import { displayHelp } from "@/utils/help";
import { initialize } from "@/utils/initialize";
import { PackageManagerFactory, VALID_PACKAGE_MANAGERS } from "@/packages/factory";
import { AddToGitIgnore, findPackageManagerLockFile, loadConfig } from "@/utils/helpers";
import type { PackageManagerType } from "@/utils/types";

const main = async () => {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Error: No command provided');
        displayHelp();
        process.exit(1);
    }

    if (args[0] === 'help') {
        displayHelp();
        process.exit(0);
    }

    if (args[0] === 'initialize') {
        await initialize(args);
        process.exit(0);
    }

    let pmType: PackageManagerType;
    const pmFlagIndex = args.findIndex(arg => arg === '--pm');
    
    if (pmFlagIndex !== -1) {
        if (pmFlagIndex === args.length - 1) {
            console.error('Error: No package manager specified after --pm flag');
            process.exit(1);
        }

        const specifiedPm = args[pmFlagIndex + 1].toLowerCase();
        if (!VALID_PACKAGE_MANAGERS.includes(specifiedPm)) {
            console.error(
                `Error: Invalid package manager "${specifiedPm}"\n` +
                `Valid package managers are: ${VALID_PACKAGE_MANAGERS.join(', ')}`
            );
            process.exit(1);
        }
        pmType = specifiedPm as PackageManagerType;

        if (!VALID_PACKAGE_MANAGERS.includes(pmType)) {
            console.error(`Error: Invalid package manager "${pmType}"`);
            process.exit(1);
        }else {
            args.splice(pmFlagIndex, 2);
        }
    } else {
        pmType = await findPackageManagerLockFile();
    }

    try {
        const pm = PackageManagerFactory(pmType);
        await pm.execute(args);
        const config = await loadConfig();
        if (config.symlink.addToGitIgnore) {
            await AddToGitIgnore();
        }
    } catch (error) {
        console.error(`Failed to execute command:\n${error}`);
        process.exit(1);
    }
};

main().catch(error => {
    console.error(`Fatal error:\n ${error.message}`);
    process.exit(1);
});

export type {
    Config
} from '@/utils/types';