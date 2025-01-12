import { Config } from '@/utils/types';

export const defaultConfig: Config = {
    packageManager: {
        default: "npm",
        detection: "auto",
    },
    symlink: {
        enabled: true,
        addToGitIgnore: true,
        nosyncName: "node_modules.nosync",
    },
    debug: {
        verbose: false,
    },
};

export default defaultConfig; 