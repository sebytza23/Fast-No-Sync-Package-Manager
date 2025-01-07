import PackageManager from "@/packages/package_manager";

export class PNodePM extends PackageManager {
    constructor() {
        super()
        this.name = 'pnpm';
    }    
}