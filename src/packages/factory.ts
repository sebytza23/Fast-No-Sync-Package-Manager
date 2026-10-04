import PackageManager from './package_manager';
import type { PackageManagerType } from '../utils/types';
export { VALID_PACKAGE_MANAGERS } from '../utils/package-managers';
export function PackageManagerFactory(
    name: PackageManagerType,
): PackageManager {
    return new PackageManager(name);
}
