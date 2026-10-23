"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanamaxClient = void 0;
const events_1 = require("events");
const net = __importStar(require("net"));
class PanamaxClient extends events_1.EventEmitter {
    log;
    socket = null;
    isConnected = false;
    isConnecting = false;
    reconnectTimer = null;
    pollTimer = null;
    buffer = '';
    status = {
        outlets: new Array(9).fill(false), // 0 unused, 1..8
    };
    host;
    port;
    pollIntervalMs;
    timeoutMs;
    delayMs;
    inFlightDelayUntil = new Map();
    confirmationTimers = new Map();
    constructor(config, log) {
        super();
        this.log = log;
        this.host = config.host;
        this.port = config.port || 23;
        this.pollIntervalMs = Math.max((config.pollInterval || 10) * 1000, 2000);
        this.timeoutMs = Math.max((config.timeout || 5) * 1000, 1000);
        this.delayMs = Math.max((config.delay !== undefined ? config.delay : 30) * 1000, 0);
    }
    start() {
        this.connect();
        this.startPolling();
    }
    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        for (const timer of this.confirmationTimers.values()) {
            clearTimeout(timer);
        }
        this.confirmationTimers.clear();
        this.inFlightDelayUntil.clear();
        this.disconnect();
    }
    connect() {
        if (this.socket || this.isConnecting) {
            return;
        }
        this.isConnecting = true;
        this.log.debug(`[${this.host}:${this.port}] Connecting...`);
        const socket = new net.Socket();
        this.socket = socket;
        socket.setTimeout(this.timeoutMs);
        socket.connect(this.port, this.host, () => {
            this.isConnected = true;
            this.isConnecting = false;
            this.log.info(`[${this.host}:${this.port}] Connected to Panamax device.`);
            this.emit('connected');
            // Attempt to enable unsolicited feedback on the device
            this.sendRaw('!SET_FEEDBACK ON\r').catch(() => {
                // Fallback for units supporting !FEEDBACK ON
                this.sendRaw('!FEEDBACK ON\r').catch(() => { });
            });
            // Request initial identification & outlet states
            this.queryId().catch(() => { });
            this.queryOutletStatus().catch(() => { });
        });
        socket.on('data', (data) => {
            this.handleIncomingData(data);
        });
        socket.on('timeout', () => {
            this.log.debug(`[${this.host}:${this.port}] Socket timeout.`);
            socket.destroy();
        });
        socket.on('error', (err) => {
            this.log.warn(`[${this.host}:${this.port}] Socket error: ${err.message}`);
        });
        socket.on('close', (hadError) => {
            this.isConnected = false;
            this.isConnecting = false;
            this.socket = null;
            this.emit('disconnected');
            if (hadError) {
                this.log.warn(`[${this.host}:${this.port}] Connection closed with error. Retrying in 10s...`);
            }
            else {
                this.log.debug(`[${this.host}:${this.port}] Connection closed.`);
            }
            this.scheduleReconnect();
        });
    }
    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 10000);
    }
    disconnect() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
    }
    startPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        this.pollTimer = setInterval(() => {
            if (this.isConnected) {
                this.queryOutletStatus().catch((err) => {
                    this.log.debug(`[${this.host}] Poll error: ${err.message}`);
                });
            }
        }, this.pollIntervalMs);
    }
    /**
     * Send a raw ASCII command string over the socket.
     */
    sendRaw(command) {
        return new Promise((resolve, reject) => {
            if (!this.socket || !this.isConnected) {
                // Try to connect if disconnected
                this.connect();
                return reject(new Error(`Not connected to Panamax at ${this.host}:${this.port}`));
            }
            this.log.debug(`[${this.host}:${this.port}] TX: ${command.trim()}`);
            this.socket.write(command, 'ascii', (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }
    /**
     * Strips Telnet IAC (0xFF) negotiation bytes so raw ASCII text is parsed cleanly.
     */
    stripTelnetIAC(data) {
        const clean = [];
        let i = 0;
        while (i < data.length) {
            if (data[i] === 0xFF) {
                // Telnet IAC command
                const cmd = data[i + 1];
                if (cmd >= 251 && cmd <= 254) {
                    // 3-byte command: IAC (DO|DONT|WILL|WONT) <option>
                    i += 3;
                }
                else {
                    // 2-byte command
                    i += 2;
                }
            }
            else {
                clean.push(data[i]);
                i++;
            }
        }
        return Buffer.from(clean);
    }
    handleIncomingData(chunk) {
        const cleaned = this.stripTelnetIAC(chunk);
        this.buffer += cleaned.toString('ascii');
        let delimiterIndex;
        while ((delimiterIndex = this.buffer.search(/[\r\n]/)) !== -1) {
            const line = this.buffer.substring(0, delimiterIndex).trim();
            this.buffer = this.buffer.substring(delimiterIndex + 1);
            if (line.length > 0) {
                this.processLine(line);
            }
        }
    }
    processLine(line) {
        this.log.debug(`[${this.host}:${this.port}] RX: ${line}`);
        // Parse status lines starting with $
        // E.g., "$OUTLET1 = ON", "$OUTLET2 = OFF"
        const outletMatch = line.match(/^\$OUTLET([1-8])\s*=\s*(ON|OFF)/i);
        if (outletMatch) {
            const outletNum = parseInt(outletMatch[1], 10);
            const state = outletMatch[2].toUpperCase() === 'ON';
            // Check if outlet is in an active switching delay window
            const delayExpiry = this.inFlightDelayUntil.get(outletNum);
            if (delayExpiry) {
                if (Date.now() < delayExpiry) {
                    if (state !== this.status.outlets[outletNum]) {
                        const remainingSec = Math.ceil((delayExpiry - Date.now()) / 1000);
                        this.log.debug(`[${this.host}] Outlet ${outletNum} is in switching delay (${remainingSec}s remaining). Suppressing reported state ${state ? 'ON' : 'OFF'}.`);
                        return;
                    }
                    else {
                        // Hardware has reached desired target state early
                        this.inFlightDelayUntil.delete(outletNum);
                    }
                }
                else {
                    this.inFlightDelayUntil.delete(outletNum);
                }
            }
            const changed = this.status.outlets[outletNum] !== state;
            this.status.outlets[outletNum] = state;
            if (changed) {
                this.log.info(`[${this.host}] Outlet ${outletNum} is now ${state ? 'ON' : 'OFF'}`);
                this.emit('outletChange', outletNum, state);
            }
            return;
        }
        // Parse ID responses
        // E.g., "$PANAMAX", "$MAX 4320-PRO", "$M4320-PRO", "$FIRMWARE: 1.0"
        if (line.startsWith('$PANAMAX')) {
            return;
        }
        if (line.match(/^\$(MAX\s*4320|M4320)/i)) {
            this.status.model = line.replace(/^\$/, '').trim();
            this.emit('info', this.status);
            return;
        }
        if (line.match(/^\$FIRMWARE/i)) {
            this.status.firmware = line.replace(/^\$FIRMWARE:\s*/i, '').trim();
            this.emit('info', this.status);
            return;
        }
        // Parse FAULTSTAT
        // E.g., "$PWR = OK", "$BREAKER = OK", "$WIRE FAULT = OK"
        const faultMatch = line.match(/^\$([A-Z\s]+)\s*=\s*(OK|FAULT)/i);
        if (faultMatch) {
            if (!this.status.faults) {
                this.status.faults = {};
            }
            this.status.faults[faultMatch[1].trim()] = faultMatch[2].trim();
            this.emit('fault', this.status.faults);
            return;
        }
    }
    /**
     * Switch a specific outlet (1..8) ON or OFF.
     */
    async setOutlet(outletNumber, on) {
        if (outletNumber < 1 || outletNumber > 8) {
            throw new Error(`Invalid outlet number ${outletNumber}. Must be between 1 and 8.`);
        }
        const stateStr = on ? 'ON' : 'OFF';
        const command = `!SWITCH ${outletNumber} ${stateStr}\r`;
        this.log.info(`[${this.host}] Switching Outlet ${outletNumber} -> ${stateStr} (delay: ${this.delayMs / 1000}s)`);
        // Update optimistic state and mark outlet in delay window
        this.status.outlets[outletNumber] = on;
        if (this.delayMs > 0) {
            this.inFlightDelayUntil.set(outletNumber, Date.now() + this.delayMs);
        }
        // Clear any previous pending confirmation timer for this outlet
        const existingTimer = this.confirmationTimers.get(outletNumber);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        await this.sendRaw(command);
        // Schedule verification query after the delay completes
        const checkDelay = this.delayMs > 0 ? this.delayMs + 500 : 300;
        const timer = setTimeout(() => {
            this.confirmationTimers.delete(outletNumber);
            this.queryOutletStatus().catch(() => { });
        }, checkDelay);
        this.confirmationTimers.set(outletNumber, timer);
        return on;
    }
    /**
     * Turn all outlets ON simultaneously.
     */
    async setAllOn() {
        this.log.info(`[${this.host}] Executing ALL_ON (delay: ${this.delayMs / 1000}s)`);
        const now = Date.now();
        for (let i = 1; i <= 8; i++) {
            this.status.outlets[i] = true;
            if (this.delayMs > 0) {
                this.inFlightDelayUntil.set(i, now + this.delayMs);
            }
            this.emit('outletChange', i, true);
        }
        const existingMasterTimer = this.confirmationTimers.get(0);
        if (existingMasterTimer) {
            clearTimeout(existingMasterTimer);
        }
        await this.sendRaw('!ALL_ON\r');
        const checkDelay = this.delayMs > 0 ? this.delayMs + 500 : 500;
        const timer = setTimeout(() => {
            this.confirmationTimers.delete(0);
            this.queryOutletStatus().catch(() => { });
        }, checkDelay);
        this.confirmationTimers.set(0, timer);
    }
    /**
     * Turn all outlets OFF simultaneously.
     */
    async setAllOff() {
        this.log.info(`[${this.host}] Executing ALL_OFF (delay: ${this.delayMs / 1000}s)`);
        const now = Date.now();
        for (let i = 1; i <= 8; i++) {
            this.status.outlets[i] = false;
            if (this.delayMs > 0) {
                this.inFlightDelayUntil.set(i, now + this.delayMs);
            }
            this.emit('outletChange', i, false);
        }
        const existingMasterTimer = this.confirmationTimers.get(0);
        if (existingMasterTimer) {
            clearTimeout(existingMasterTimer);
        }
        await this.sendRaw('!ALL_OFF\r');
        const checkDelay = this.delayMs > 0 ? this.delayMs + 500 : 500;
        const timer = setTimeout(() => {
            this.confirmationTimers.delete(0);
            this.queryOutletStatus().catch(() => { });
        }, checkDelay);
        this.confirmationTimers.set(0, timer);
    }
    /**
     * Trigger Reboot 1 sequence.
     */
    async triggerReboot1() {
        this.log.info(`[${this.host}] Triggering REBOOT_1`);
        await this.sendRaw('!REBOOT_1\r');
    }
    /**
     * Trigger Reboot 2 sequence.
     */
    async triggerReboot2() {
        this.log.info(`[${this.host}] Triggering REBOOT_2`);
        await this.sendRaw('!REBOOT_2\r');
    }
    /**
     * Query outlet status (?OUTLETSTAT).
     */
    async queryOutletStatus() {
        await this.sendRaw('?OUTLETSTAT\r');
        return this.status.outlets.slice(1);
    }
    /**
     * Query device ID (?ID).
     */
    async queryId() {
        await this.sendRaw('?ID\r');
    }
    /**
     * Query unit firmware (?FIRMWARE).
     */
    async queryFirmware() {
        await this.sendRaw('?FIRMWARE\r');
    }
    /**
     * Query unit fault status (?FAULTSTAT).
     */
    async queryFaults() {
        await this.sendRaw('?FAULTSTAT\r');
    }
}
exports.PanamaxClient = PanamaxClient;
//# sourceMappingURL=panamaxClient.js.map