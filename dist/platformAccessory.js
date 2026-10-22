"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanamaxRebootAccessory = exports.PanamaxMasterSwitchAccessory = exports.PanamaxOutletAccessory = void 0;
class PanamaxOutletAccessory {
    platform;
    accessory;
    client;
    service;
    outletIndex;
    isOutletType;
    constructor(platform, accessory, client, outletConfig) {
        this.platform = platform;
        this.accessory = accessory;
        this.client = client;
        this.outletIndex = outletConfig.index;
        this.isOutletType = (outletConfig.accessoryType || 'Outlet') === 'Outlet';
        // Set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)
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
        this.service.setCharacteristic(this.platform.Characteristic.Name, outletConfig.name || `Outlet ${this.outletIndex}`);
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
        this.client.on('outletChange', (index, state) => {
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
                this.accessory.getService(this.platform.Service.AccessoryInformation)
                    .updateCharacteristic(this.platform.Characteristic.Model, status.model);
            }
            if (status.firmware) {
                this.accessory.getService(this.platform.Service.AccessoryInformation)
                    .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, status.firmware);
            }
        });
    }
    async setOn(value) {
        const targetState = value;
        try {
            await this.client.setOutlet(this.outletIndex, targetState);
            if (this.isOutletType) {
                this.service.updateCharacteristic(this.platform.Characteristic.OutletInUse, targetState);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.platform.log.error(`Failed to set Outlet ${this.outletIndex} on ${this.client['host']}: ${message}`);
            throw new this.platform.api.hap.HapStatusError(-70402 /* this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
        }
    }
    async getOn() {
        const currentState = !!this.client.status.outlets[this.outletIndex];
        return currentState;
    }
}
exports.PanamaxOutletAccessory = PanamaxOutletAccessory;
class PanamaxMasterSwitchAccessory {
    platform;
    accessory;
    client;
    service;
    constructor(platform, accessory, client, name) {
        this.platform = platform;
        this.accessory = accessory;
        this.client = client;
        this.accessory.getService(this.platform.Service.AccessoryInformation)
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
    getAnyOn() {
        for (let i = 1; i <= 8; i++) {
            if (this.client.status.outlets[i]) {
                return true;
            }
        }
        return false;
    }
    async setOn(value) {
        const targetState = value;
        try {
            if (targetState) {
                await this.client.setAllOn();
            }
            else {
                await this.client.setAllOff();
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.platform.log.error(`Failed to set Master Switch on ${this.client['host']}: ${message}`);
            throw new this.platform.api.hap.HapStatusError(-70402 /* this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
        }
    }
    async getOn() {
        return this.getAnyOn();
    }
}
exports.PanamaxMasterSwitchAccessory = PanamaxMasterSwitchAccessory;
class PanamaxRebootAccessory {
    platform;
    accessory;
    client;
    rebootId;
    service;
    constructor(platform, accessory, client, rebootId, name) {
        this.platform = platform;
        this.accessory = accessory;
        this.client = client;
        this.rebootId = rebootId;
        this.accessory.getService(this.platform.Service.AccessoryInformation)
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
    async setOn(value) {
        if (value) {
            try {
                if (this.rebootId === 1) {
                    await this.client.triggerReboot1();
                }
                else {
                    await this.client.triggerReboot2();
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.platform.log.error(`Failed to trigger Reboot ${this.rebootId} on ${this.client['host']}: ${message}`);
                throw new this.platform.api.hap.HapStatusError(-70402 /* this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
            }
            finally {
                // Reset switch back to OFF in HomeKit after 1 second
                setTimeout(() => {
                    this.service.updateCharacteristic(this.platform.Characteristic.On, false);
                }, 1000);
            }
        }
    }
}
exports.PanamaxRebootAccessory = PanamaxRebootAccessory;
//# sourceMappingURL=platformAccessory.js.map