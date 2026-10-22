import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { OutletConfig } from './platformAccessory';
export interface PanamaxDeviceConfig {
    name: string;
    host: string;
    port?: number;
    pollInterval?: number;
    enableAllOutletsSwitch?: boolean;
    enableRebootButtons?: boolean;
    outlets?: OutletConfig[];
}
export declare class Panamax4320Platform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: PlatformAccessory[];
    private readonly clients;
    constructor(log: Logger, config: PlatformConfig, api: API);
    configureAccessory(accessory: PlatformAccessory): void;
    discoverDevices(): void;
}
