import { type PackageLauncherPanel, type RequestContext } from './contracts.js';
export declare function createConnectingmatrixProjectsStubLauncher(context?: RequestContext): PackageLauncherPanel;
export declare const createStubLauncher: typeof createConnectingmatrixProjectsStubLauncher;
export declare const Launcher: {
    open: typeof createConnectingmatrixProjectsStubLauncher;
    mode: "stub";
};
export declare const launcher: typeof createConnectingmatrixProjectsStubLauncher;
