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
  PanamaxDeviceAccessory,
  PanamaxIndividualOutletAccessory,
  PanamaxDeviceConfig,
  OutletConfig,
} from './platformAccessory';

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

    this.log.info(`Initializing Panamax 4320 Platform: "${this.config.name || 'Panamax 4320'}"`);

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

    if (devices.length === 0) {
      this.log.warn('No Panamax devices configured. Please check your Homebridge configuration.');
      return;
    }

    this.log.info(`Discovering and registering ${devices.length} configured Panamax device(s)...`);

    for (const [deviceIndex, deviceConfig] of devices.entries()) {
      if (!deviceConfig.host) {
        this.log.warn(`Device #${deviceIndex + 1} (${deviceConfig.name || 'Unnamed'}) is missing host IP or address. Skipping.`);
        continue;
      }

      // Ensure every device has an identifiable unique name
      const deviceName = deviceConfig.name?.trim() || `Panamax Unit ${deviceIndex + 1}`;
      const deviceIdentifier = deviceConfig.id?.trim() || deviceName;
      const mode = deviceConfig.accessoryMode || 'device';

      this.log.info(`[${deviceName}] Configuring unit at ${deviceConfig.host}:${deviceConfig.port || 23} (Mode: ${mode})`);

      // Initialize persistent TCP client for this physical Panamax device
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

      if (mode === 'device') {
        // UNIFIED DEVICE MODE (Default & Recommended)
        // Publishes 1 single clean accessory per Panamax unit, containing 8 outlet services.
        const deviceUuid = this.api.hap.uuid.generate(`panamax:device:${deviceIdentifier}`);
        activeUUIDs.add(deviceUuid);

        const existingAccessory = this.accessories.find((acc) => acc.UUID === deviceUuid);

        if (existingAccessory) {
          this.log.info(`[${deviceName}] Restoring existing device accessory from cache: "${existingAccessory.displayName}"`);
          existingAccessory.displayName = deviceName;
          new PanamaxDeviceAccessory(this, existingAccessory, client, { ...deviceConfig, name: deviceName });
        } else {
          this.log.info(`[${deviceName}] Registering new unified device accessory: "${deviceName}"`);
          const accessory = new this.api.platformAccessory(deviceName, deviceUuid);
          new PanamaxDeviceAccessory(this, accessory, client, { ...deviceConfig, name: deviceName });
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.accessories.push(accessory);
        }
      } else {
        // INDIVIDUAL OUTLETS MODE
        // Publishes each outlet as a separate PlatformAccessory tile
        const configuredOutlets: OutletConfig[] = [];
        for (let i = 1; i <= 8; i++) {
          const custom = deviceConfig.outlets?.find((o) => o.index === i);
          if (custom && custom.enabled === false) {
            continue;
          }
          configuredOutlets.push(
            custom || {
              index: i,
              name: `Outlet ${i}`,
              enabled: true,
              accessoryType: 'Outlet',
            },
          );
        }

        for (const outlet of configuredOutlets) {
          const outletUuid = this.api.hap.uuid.generate(`panamax:${deviceIdentifier}:outlet:${outlet.index}`);
          activeUUIDs.add(outletUuid);

          const displayName = `${deviceName} ${outlet.name || `Outlet ${outlet.index}`}`;
          const existing = this.accessories.find((acc) => acc.UUID === outletUuid);

          if (existing) {
            this.log.info(`[${deviceName}] Restoring individual outlet accessory from cache: "${existing.displayName}"`);
            new PanamaxIndividualOutletAccessory(this, existing, client, { ...deviceConfig, name: deviceName }, outlet);
          } else {
            this.log.info(`[${deviceName}] Adding individual outlet accessory: "${displayName}"`);
            const accessory = new this.api.platformAccessory(displayName, outletUuid);
            new PanamaxIndividualOutletAccessory(this, accessory, client, { ...deviceConfig, name: deviceName }, outlet);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            this.accessories.push(accessory);
          }
        }
      }
    }

    // Clean up stale or legacy accessories from previous versions
    const staleAccessories = this.accessories.filter((acc) => !activeUUIDs.has(acc.UUID));
    if (staleAccessories.length > 0) {
      this.log.info(`Cleaning up ${staleAccessories.length} stale/legacy accessories from cache.`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
    }
  }
}
