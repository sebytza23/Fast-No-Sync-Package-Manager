import { PackageManagerType, PackageManagerLockFile } from "@/utils/types";
import {BunPM} from "./bun";
import {DenoPM} from "./deno";
import { NodePM } from "./npm";
import  PackageManager from "./package_manager";
import { PNodePM } from "./pnpm";
import { YarnPM } from "./yarn";

export const VALID_PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'deno', 'bun'];

export function PackageManagerFactory(packageManager: PackageManagerType | PackageManagerLockFile): PackageManager {
    switch (packageManager) {
        case 'npm':
        case 'package-lock.json':
            return new NodePM();
        case 'yarn':
        case 'yarn.lock':
            return new YarnPM();
        case 'pnpm':
        case 'pnpm-lock.yaml':
            return new PNodePM();
        case 'bun':
        case 'bun.lockb':
            return new BunPM();
        case 'deno':
        case 'deno.lock':
            return new DenoPM();
        
    }
}