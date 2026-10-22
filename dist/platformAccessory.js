"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanamaxIndividualOutletAccessory = exports.PanamaxDeviceAccessory = void 0;
/**
 * Unified Device Accessory (Default & Recommended):
 * Exposes the entire Panamax unit as a single HomeKit accessory with 8 outlet services.
 * In Apple Home and Homebridge, it appears cleanly as ONE device with multiple outlets.
 */
class PanamaxDeviceAccessory {
    platform;
    accessory;
    client;
    deviceConfig;
    outletServices = new Map();
    masterService;
    constructor(platform, accessory, client, deviceConfig) {
        this.platform = platform;
        this.accessory = accessory;
        this.client = client;
        this.deviceConfig = deviceConfig;
        const deviceIdentifier = deviceConfig.id || deviceConfig.name;
        // 1. Configure AccessoryInformation
        const infoService = this.accessory.getService(this.platform.Service.AccessoryInformation);
        infoService
            .setCharacteristic(this.platform.Characteristic.Name, deviceConfig.name)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Panamax')
            .setCharacteristic(this.platform.Characteristic.Model, client.status.model || 'M4320-PRO')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `PANAMAX-${deviceIdentifier}`);
        // Update dynamic model/firmware if reported by the device
        this.client.on('info', (status) => {
            if (status.model) {
                infoService.updateCharacteristic(this.platform.Characteristic.Model, status.model);
            }
            if (status.firmware) {
                infoService.updateCharacteristic(this.platform.Characteristic.FirmwareRevision, status.firmware);
            }
        });
        // 2. Setup Outlets 1..8
        this.setupOutlets();
        // 3. Optional Master Switch (All Outlets)
        if (this.deviceConfig.enableAllOutletsSwitch) {
            this.setupMasterSwitch();
        }
        else {
            this.removeServiceIfPresent(this.platform.Service.Switch, 'master');
        }
        // 4. Optional Reboot Buttons (Momentary Switches)
        if (this.deviceConfig.enableRebootButtons) {
            this.setupRebootButtons();
        }
        else {
            this.removeServiceIfPresent(this.platform.Service.Switch, 'reboot-1');
            this.removeServiceIfPresent(this.platform.Service.Switch, 'reboot-2');
        }
        // 5. Listen for live state changes from the Panamax TCP client
        this.client.on('outletChange', (index, state) => {
            const service = this.outletServices.get(index);
            if (service) {
                service.updateCharacteristic(this.platform.Characteristic.On, state);
                if (service.testCharacteristic(this.platform.Characteristic.OutletInUse)) {
                    service.updateCharacteristic(this.platform.Characteristic.OutletInUse, state);
                }
            }
            if (this.masterService) {
                this.masterService.updateCharacteristic(this.platform.Characteristic.On, this.isAnyOutletOn());
            }
        });
    }
    setupOutlets() {
        const configuredOutlets = this.deviceConfig.outlets || [];
        for (let i = 1; i <= 8; i++) {
            const outletConfig = configuredOutlets.find((o) => o.index === i);
            const isEnabled = outletConfig ? outletConfig.enabled !== false : true;
            const subtype = `outlet-${i}`;
            if (!isEnabled) {
                // Remove if previously added
                this.removeServiceIfPresent(this.platform.Service.Outlet, subtype);
                this.removeServiceIfPresent(this.platform.Service.Switch, subtype);
                this.outletServices.delete(i);
                continue;
            }
            const isOutletType = (outletConfig?.accessoryType || 'Outlet') === 'Outlet';
            const TargetService = isOutletType ? this.platform.Service.Outlet : this.platform.Service.Switch;
            const OpposingService = isOutletType ? this.platform.Service.Switch : this.platform.Service.Outlet;
            // Remove conflicting opposite service type if changed in config
            const opposing = this.accessory.getServiceById(OpposingService, subtype);
            if (opposing) {
                this.accessory.removeService(opposing);
            }
            const outletDisplayName = outletConfig?.name || `Outlet ${i}`;
            let service = this.accessory.getServiceById(TargetService, subtype);
            if (!service) {
                service = this.accessory.addService(TargetService, outletDisplayName, subtype);
            }
            else {
                service.setCharacteristic(this.platform.Characteristic.Name, outletDisplayName);
            }
            // Configure characteristics
            service.getCharacteristic(this.platform.Characteristic.On)
                .onSet((value) => this.setOutletState(i, value))
                .onGet(() => !!this.client.status.outlets[i]);
            if (isOutletType) {
                service.getCharacteristic(this.platform.Characteristic.OutletInUse)
                    .onGet(() => !!this.client.status.outlets[i]);
            }
            this.outletServices.set(i, service);
        }
    }
    setupMasterSwitch() {
        const subtype = 'master';
        const name = `${this.deviceConfig.name} All Outlets`;
        let service = this.accessory.getServiceById(this.platform.Service.Switch, subtype);
        if (!service) {
            service = this.accessory.addService(this.platform.Service.Switch, name, subtype);
        }
        else {
            service.setCharacteristic(this.platform.Characteristic.Name, name);
        }
        service.getCharacteristic(this.platform.Characteristic.On)
            .onSet(async (value) => {
            const on = value;
            if (on) {
                await this.client.setAllOn();
            }
            else {
                await this.client.setAllOff();
            }
        })
            .onGet(() => this.isAnyOutletOn());
        this.masterService = service;
    }
    setupRebootButtons() {
        for (const rebootId of [1, 2]) {
            const subtype = `reboot-${rebootId}`;
            const name = `${this.deviceConfig.name} Reboot ${rebootId}`;
            let service = this.accessory.getServiceById(this.platform.Service.Switch, subtype);
            if (!service) {
                service = this.accessory.addService(this.platform.Service.Switch, name, subtype);
            }
            else {
                service.setCharacteristic(this.platform.Characteristic.Name, name);
            }
            service.getCharacteristic(this.platform.Characteristic.On)
                .onSet(async (value) => {
                if (value) {
                    try {
                        if (rebootId === 1) {
                            await this.client.triggerReboot1();
                        }
                        else {
                            await this.client.triggerReboot2();
                        }
                    }
                    finally {
                        // Momentary reset back to OFF after 1 second
                        setTimeout(() => {
                            service?.updateCharacteristic(this.platform.Characteristic.On, false);
                        }, 1000);
                    }
                }
            })
                .onGet(() => false);
        }
    }
    isAnyOutletOn() {
        for (let i = 1; i <= 8; i++) {
            if (this.client.status.outlets[i]) {
                return true;
            }
        }
        return false;
    }
    async setOutletState(outletIndex, targetState) {
        try {
            await this.client.setOutlet(outletIndex, targetState);
            const service = this.outletServices.get(outletIndex);
            if (service && service.testCharacteristic(this.platform.Characteristic.OutletInUse)) {
                service.updateCharacteristic(this.platform.Characteristic.OutletInUse, targetState);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.platform.log.error(`[${this.deviceConfig.name}] Failed to switch outlet ${outletIndex}: ${message}`);
            throw new this.platform.api.hap.HapStatusError(-70402 /* this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
        }
    }
    removeServiceIfPresent(serviceType, subtype) {
        const existing = this.accessory.getServiceById(serviceType, subtype);
        if (existing) {
            this.accessory.removeService(existing);
        }
    }
}
exports.PanamaxDeviceAccessory = PanamaxDeviceAccessory;
/**
 * Individual Outlet Accessory Mode (Alternative):
 * Used only when accessoryMode is explicitly set to 'individual'.
 */
class PanamaxIndividualOutletAccessory {
    platform;
    accessory;
    client;
    deviceConfig;
    service;
    outletIndex;
    isOutletType;
    constructor(platform, accessory, client, deviceConfig, outletConfig) {
        this.platform = platform;
        this.accessory = accessory;
        this.client = client;
        this.deviceConfig = deviceConfig;
        this.outletIndex = outletConfig.index;
        this.isOutletType = (outletConfig.accessoryType || 'Outlet') === 'Outlet';
        const deviceIdentifier = deviceConfig.id || deviceConfig.name;
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Panamax')
            .setCharacteristic(this.platform.Characteristic.Model, client.status.model || 'M4320-PRO')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `PANAMAX-${deviceIdentifier}-OUTLET-${this.outletIndex}`);
        const TargetService = this.isOutletType ? this.platform.Service.Outlet : this.platform.Service.Switch;
        const OpposingService = this.isOutletType ? this.platform.Service.Switch : this.platform.Service.Outlet;
        const oldOpposing = this.accessory.getService(OpposingService);
        if (oldOpposing) {
            this.accessory.removeService(oldOpposing);
        }
        this.service = this.accessory.getService(TargetService) || this.accessory.addService(TargetService);
        const displayName = `${deviceConfig.name} ${outletConfig.name || `Outlet ${this.outletIndex}`}`;
        this.service.setCharacteristic(this.platform.Characteristic.Name, displayName);
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onSet(this.setOn.bind(this))
            .onGet(this.getOn.bind(this));
        if (this.isOutletType) {
            this.service.getCharacteristic(this.platform.Characteristic.OutletInUse)
                .onGet(this.getOn.bind(this));
        }
        this.client.on('outletChange', (index, state) => {
            if (index === this.outletIndex) {
                this.service.updateCharacteristic(this.platform.Characteristic.On, state);
                if (this.isOutletType) {
                    this.service.updateCharacteristic(this.platform.Characteristic.OutletInUse, state);
                }
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
            this.platform.log.error(`[${this.deviceConfig.name}] Outlet ${this.outletIndex} error: ${message}`);
            throw new this.platform.api.hap.HapStatusError(-70402 /* this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
        }
    }
    async getOn() {
        return !!this.client.status.outlets[this.outletIndex];
    }
}
exports.PanamaxIndividualOutletAccessory = PanamaxIndividualOutletAccessory;
//# sourceMappingURL=platformAccessory.js.map