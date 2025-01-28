import { PackageManagerType, PackageManagerLockFile } from "@/utils/types";
import { PACKAGE_MANAGERS, LOCK_FILE_TO_PM_MAP } from "@/utils/package-managers";
import {BunPM} from "./bun";
import {DenoPM} from "./deno";
import { NodePM } from "./npm";
import  PackageManager from "./package_manager";
import { PNodePM } from "./pnpm";
import { YarnPM } from "./yarn";

export const VALID_PACKAGE_MANAGERS = Object.keys(PACKAGE_MANAGERS);

export function PackageManagerFactory(packageManager: PackageManagerType | PackageManagerLockFile): PackageManager {
    // If it's a lock file, convert it to package manager type
    const pmType = LOCK_FILE_TO_PM_MAP[packageManager as PackageManagerLockFile] || packageManager;

    switch (pmType) {
        case 'npm':
            return new NodePM();
        case 'yarn':
            return new YarnPM();
        case 'pnpm':
            return new PNodePM();
        case 'bun':
            return new BunPM();
        case 'deno':
            return new DenoPM();
        default:
            throw new Error(`Unsupported package manager: ${pmType}`);
    }
}