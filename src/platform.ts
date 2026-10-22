import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { PanamaxClient } from './panamaxClient';
import {
  PanamaxOutletAccessory,
  PanamaxMasterSwitchAccessory,
  PanamaxRebootAccessory,
  OutletConfig,
} from './platformAccessory';

export interface PanamaxDeviceConfig {
  name: string;
  host: string;
  port?: number;
  pollInterval?: number;
  enableAllOutletsSwitch?: boolean;
  enableRebootButtons?: boolean;
  outlets?: OutletConfig[];
}

export class Panamax4320Platform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private readonly clients: PanamaxClient[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });

    this.api.on('shutdown', () => {
      for (const client of this.clients) {
        client.stop();
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    const devices = (this.config.devices as PanamaxDeviceConfig[]) || [];
    const activeUUIDs = new Set<string>();

    for (const deviceConfig of devices) {
      if (!deviceConfig.host) {
        this.log.warn('Device configuration missing host IP or address. Skipping.');
        continue;
      }

      const client = new PanamaxClient(
        {
          host: deviceConfig.host,
          port: deviceConfig.port || 23,
          pollInterval: deviceConfig.pollInterval || 10,
        },
        this.log,
      );
      this.clients.push(client);
      client.start();

      // Configure Outlets 1..8
      const outletConfigs: OutletConfig[] = [];
      for (let i = 1; i <= 8; i++) {
        const customConfig = deviceConfig.outlets?.find((o) => o.index === i);
        if (customConfig && customConfig.enabled === false) {
          // User explicitly disabled this outlet
          continue;
        }
        outletConfigs.push(
          customConfig || {
            index: i,
            name: `${deviceConfig.name} Outlet ${i}`,
            enabled: true,
            accessoryType: 'Outlet',
          },
        );
      }

      for (const outletConfig of outletConfigs) {
        const uuid = this.api.hap.uuid.generate(
          `${deviceConfig.host}:${deviceConfig.port || 23}:outlet:${outletConfig.index}`,
        );
        activeUUIDs.add(uuid);

        const existingAccessory = this.accessories.find((acc) => acc.UUID === uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing outlet accessory from cache:', existingAccessory.displayName);
          new PanamaxOutletAccessory(this, existingAccessory, client, outletConfig);
        } else {
          const displayName = outletConfig.name || `${deviceConfig.name} Outlet ${outletConfig.index}`;
          this.log.info('Adding new outlet accessory:', displayName);
          const accessory = new this.api.platformAccessory(displayName, uuid);
          new PanamaxOutletAccessory(this, accessory, client, outletConfig);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.accessories.push(accessory);
        }
      }

      // Optional Master All Outlets Switch
      if (deviceConfig.enableAllOutletsSwitch) {
        const masterUuid = this.api.hap.uuid.generate(
          `${deviceConfig.host}:${deviceConfig.port || 23}:master_switch`,
        );
        activeUUIDs.add(masterUuid);
        const existingMaster = this.accessories.find((acc) => acc.UUID === masterUuid);
        const masterName = `${deviceConfig.name} All Outlets`;

        if (existingMaster) {
          this.log.info('Restoring existing master accessory from cache:', existingMaster.displayName);
          new PanamaxMasterSwitchAccessory(this, existingMaster, client, masterName);
        } else {
          this.log.info('Adding new master switch accessory:', masterName);
          const accessory = new this.api.platformAccessory(masterName, masterUuid);
          new PanamaxMasterSwitchAccessory(this, accessory, client, masterName);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.accessories.push(accessory);
        }
      }

      // Optional Reboot 1 & 2 buttons
      if (deviceConfig.enableRebootButtons) {
        for (const rebootId of [1, 2] as const) {
          const rebootUuid = this.api.hap.uuid.generate(
            `${deviceConfig.host}:${deviceConfig.port || 23}:reboot:${rebootId}`,
          );
          activeUUIDs.add(rebootUuid);
          const existingReboot = this.accessories.find((acc) => acc.UUID === rebootUuid);
          const rebootName = `${deviceConfig.name} Reboot ${rebootId}`;

          if (existingReboot) {
            this.log.info('Restoring existing reboot accessory from cache:', existingReboot.displayName);
            new PanamaxRebootAccessory(this, existingReboot, client, rebootId, rebootName);
          } else {
            this.log.info('Adding new reboot accessory:', rebootName);
            const accessory = new this.api.platformAccessory(rebootName, rebootUuid);
            new PanamaxRebootAccessory(this, accessory, client, rebootId, rebootName);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            this.accessories.push(accessory);
          }
        }
      }
    }

    // Clean up stale accessories that are no longer configured
    const staleAccessories = this.accessories.filter((acc) => !activeUUIDs.has(acc.UUID));
    if (staleAccessories.length > 0) {
      this.log.info(`Removing ${staleAccessories.length} stale accessories from cache.`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
    }
  }
}
