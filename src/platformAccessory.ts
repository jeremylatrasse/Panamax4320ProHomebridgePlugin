import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { Panamax4320Platform } from './platform';
import { PanamaxClient } from './panamaxClient';

export interface OutletConfig {
  index: number;
  name?: string;
  enabled?: boolean;
  accessoryType?: 'Outlet' | 'Switch';
}

export class PanamaxOutletAccessory {
  private service: Service;
  private readonly outletIndex: number;
  private readonly isOutletType: boolean;

  constructor(
    private readonly platform: Panamax4320Platform,
    private readonly accessory: PlatformAccessory,
    private readonly client: PanamaxClient,
    private readonly outletConfig: OutletConfig,
  ) {
    this.outletIndex = outletConfig.index;
    this.isOutletType = (outletConfig.accessoryType || 'Outlet') === 'Outlet';

    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Panamax')
      .setCharacteristic(this.platform.Characteristic.Model, client.status.model || 'M4320-PRO')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `PANAMAX-${client['host']}-OUTLET-${this.outletIndex}`);

    // Create or get the configured service type (Outlet or Switch)
    const TargetService = this.isOutletType ? this.platform.Service.Outlet : this.platform.Service.Switch;

    // Clean up opposing service if user switched type in config
    const OpposingService = this.isOutletType ? this.platform.Service.Switch : this.platform.Service.Outlet;
    const oldOpposingService = this.accessory.getService(OpposingService);
    if (oldOpposingService) {
      this.accessory.removeService(oldOpposingService);
    }

    this.service = this.accessory.getService(TargetService) || this.accessory.addService(TargetService);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      outletConfig.name || `Outlet ${this.outletIndex}`,
    );

    // Register handlers for On characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    // If configured as Outlet service, also manage OutletInUse
    if (this.isOutletType) {
      this.service.getCharacteristic(this.platform.Characteristic.OutletInUse)
        .onGet(this.getOn.bind(this));
    }

    // Listen for live updates from PanamaxClient
    this.client.on('outletChange', (index: number, state: boolean) => {
      if (index === this.outletIndex) {
        this.service.updateCharacteristic(this.platform.Characteristic.On, state);
        if (this.isOutletType) {
          this.service.updateCharacteristic(this.platform.Characteristic.OutletInUse, state);
        }
      }
    });

    // Update model / firmware if updated after connection
    this.client.on('info', (status) => {
      if (status.model) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .updateCharacteristic(this.platform.Characteristic.Model, status.model);
      }
      if (status.firmware) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, status.firmware);
      }
    });
  }

  async setOn(value: CharacteristicValue): Promise<void> {
    const targetState = value as boolean;
    try {
      await this.client.setOutlet(this.outletIndex, targetState);
      if (this.isOutletType) {
        this.service.updateCharacteristic(this.platform.Characteristic.OutletInUse, targetState);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.platform.log.error(`Failed to set Outlet ${this.outletIndex} on ${this.client['host']}: ${message}`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    const currentState = !!this.client.status.outlets[this.outletIndex];
    return currentState;
  }
}

export class PanamaxMasterSwitchAccessory {
  private service: Service;

  constructor(
    private readonly platform: Panamax4320Platform,
    private readonly accessory: PlatformAccessory,
    private readonly client: PanamaxClient,
    private readonly name: string,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Panamax')
      .setCharacteristic(this.platform.Characteristic.Model, 'M4320-PRO Master')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `PANAMAX-${client['host']}-MASTER`);

    this.service = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);

    this.service.setCharacteristic(this.platform.Characteristic.Name, name);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    // When any outlet changes, update master switch status
    this.client.on('outletChange', () => {
      this.service.updateCharacteristic(this.platform.Characteristic.On, this.getAnyOn());
    });
  }

  private getAnyOn(): boolean {
    for (let i = 1; i <= 8; i++) {
      if (this.client.status.outlets[i]) {
        return true;
      }
    }
    return false;
  }

  async setOn(value: CharacteristicValue): Promise<void> {
    const targetState = value as boolean;
    try {
      if (targetState) {
        await this.client.setAllOn();
      } else {
        await this.client.setAllOff();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.platform.log.error(`Failed to set Master Switch on ${this.client['host']}: ${message}`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    return this.getAnyOn();
  }
}

export class PanamaxRebootAccessory {
  private service: Service;

  constructor(
    private readonly platform: Panamax4320Platform,
    private readonly accessory: PlatformAccessory,
    private readonly client: PanamaxClient,
    private readonly rebootId: 1 | 2,
    private readonly name: string,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Panamax')
      .setCharacteristic(this.platform.Characteristic.Model, `M4320-PRO Reboot ${rebootId}`)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `PANAMAX-${client['host']}-REBOOT-${rebootId}`);

    this.service = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);

    this.service.setCharacteristic(this.platform.Characteristic.Name, name);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(() => false); // Stateless momentary button
  }

  async setOn(value: CharacteristicValue): Promise<void> {
    if (value) {
      try {
        if (this.rebootId === 1) {
          await this.client.triggerReboot1();
        } else {
          await this.client.triggerReboot2();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.platform.log.error(`Failed to trigger Reboot ${this.rebootId} on ${this.client['host']}: ${message}`);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      } finally {
        // Reset switch back to OFF in HomeKit after 1 second
        setTimeout(() => {
          this.service.updateCharacteristic(this.platform.Characteristic.On, false);
        }, 1000);
      }
    }
  }
}
