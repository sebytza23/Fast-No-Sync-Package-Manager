import PackageManager from "@/packages/package_manager";

export class YarnPM extends PackageManager {
    constructor() {
        super();
        this.name = 'yarn';
    }
}