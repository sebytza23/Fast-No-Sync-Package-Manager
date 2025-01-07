import PackageManager from "@/packages/package_manager";

export class NodePM extends PackageManager {
    constructor() {
        super();
        this.name = 'npm';
    }
}