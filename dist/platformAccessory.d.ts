import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { Panamax4320Platform } from './platform';
import { PanamaxClient } from './panamaxClient';
export interface OutletConfig {
    index: number;
    name?: string;
    enabled?: boolean;
    accessoryType?: 'Outlet' | 'Switch';
}
export declare class PanamaxOutletAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly client;
    private service;
    private readonly outletIndex;
    private readonly isOutletType;
    constructor(platform: Panamax4320Platform, accessory: PlatformAccessory, client: PanamaxClient, outletConfig: OutletConfig);
    setOn(value: CharacteristicValue): Promise<void>;
    getOn(): Promise<CharacteristicValue>;
}
export declare class PanamaxMasterSwitchAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly client;
    private service;
    constructor(platform: Panamax4320Platform, accessory: PlatformAccessory, client: PanamaxClient, name: string);
    private getAnyOn;
    setOn(value: CharacteristicValue): Promise<void>;
    getOn(): Promise<CharacteristicValue>;
}
export declare class PanamaxRebootAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly client;
    private readonly rebootId;
    private service;
    constructor(platform: Panamax4320Platform, accessory: PlatformAccessory, client: PanamaxClient, rebootId: 1 | 2, name: string);
    setOn(value: CharacteristicValue): Promise<void>;
}
