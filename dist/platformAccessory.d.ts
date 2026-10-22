import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { Panamax4320Platform } from './platform';
import { PanamaxClient } from './panamaxClient';
export interface OutletConfig {
    index: number;
    name?: string;
    enabled?: boolean;
    accessoryType?: 'Outlet' | 'Switch';
}
export interface PanamaxDeviceConfig {
    name: string;
    id?: string;
    host: string;
    port?: number;
    pollInterval?: number;
    accessoryMode?: 'device' | 'individual';
    enableAllOutletsSwitch?: boolean;
    enableRebootButtons?: boolean;
    outlets?: OutletConfig[];
}
/**
 * Unified Device Accessory (Default & Recommended):
 * Exposes the entire Panamax unit as a single HomeKit accessory with 8 outlet services.
 * In Apple Home and Homebridge, it appears cleanly as ONE device with multiple outlets.
 */
export declare class PanamaxDeviceAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly client;
    private readonly deviceConfig;
    private outletServices;
    private masterService?;
    constructor(platform: Panamax4320Platform, accessory: PlatformAccessory, client: PanamaxClient, deviceConfig: PanamaxDeviceConfig);
    private setupOutlets;
    private setupMasterSwitch;
    private setupRebootButtons;
    private isAnyOutletOn;
    private setOutletState;
    private removeServiceIfPresent;
}
/**
 * Individual Outlet Accessory Mode (Alternative):
 * Used only when accessoryMode is explicitly set to 'individual'.
 */
export declare class PanamaxIndividualOutletAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly client;
    private readonly deviceConfig;
    private service;
    private readonly outletIndex;
    private readonly isOutletType;
    constructor(platform: Panamax4320Platform, accessory: PlatformAccessory, client: PanamaxClient, deviceConfig: PanamaxDeviceConfig, outletConfig: OutletConfig);
    setOn(value: CharacteristicValue): Promise<void>;
    getOn(): Promise<CharacteristicValue>;
}
