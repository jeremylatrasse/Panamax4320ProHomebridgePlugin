import { EventEmitter } from 'events';
import * as net from 'net';
import { Logging } from 'homebridge';

export interface PanamaxClientConfig {
  host: string;
  port: number;
  pollInterval?: number; // in seconds
  timeout?: number;      // in seconds
}

export interface PanamaxDeviceStatus {
  outlets: boolean[]; // 1-indexed (outlets[1] .. outlets[8])
  model?: string;
  firmware?: string;
  faults?: Record<string, string>;
}

export class PanamaxClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private isConnected = false;
  private isConnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private buffer = '';
  private commandQueue: Array<{
    command: string;
    resolve: (response: string[]) => void;
    reject: (err: Error) => void;
    expectedPrefix?: string;
    timeoutTimer?: NodeJS.Timeout;
  }> = [];
  private isProcessingQueue = false;

  public status: PanamaxDeviceStatus = {
    outlets: new Array(9).fill(false), // 0 unused, 1..8
  };

  private readonly host: string;
  private readonly port: number;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: PanamaxClientConfig,
    private readonly log: Logging,
  ) {
    super();
    this.host = config.host;
    this.port = config.port || 23;
    this.pollIntervalMs = Math.max((config.pollInterval || 10) * 1000, 2000);
    this.timeoutMs = Math.max((config.timeout || 5) * 1000, 1000);
  }

  public start(): void {
    this.connect();
    this.startPolling();
  }

  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.disconnect();
  }

  private connect(): void {
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
        this.sendRaw('!FEEDBACK ON\r').catch(() => {/* ignore */});
      });

      // Request initial identification & outlet states
      this.queryId().catch(() => {/* ignore */});
      this.queryOutletStatus().catch(() => {/* ignore */});
    });

    socket.on('data', (data: Buffer) => {
      this.handleIncomingData(data);
    });

    socket.on('timeout', () => {
      this.log.debug(`[${this.host}:${this.port}] Socket timeout.`);
      socket.destroy();
    });

    socket.on('error', (err: Error) => {
      this.log.warn(`[${this.host}:${this.port}] Socket error: ${err.message}`);
    });

    socket.on('close', (hadError: boolean) => {
      this.isConnected = false;
      this.isConnecting = false;
      this.socket = null;
      this.emit('disconnected');
      if (hadError) {
        this.log.warn(`[${this.host}:${this.port}] Connection closed with error. Retrying in 10s...`);
      } else {
        this.log.debug(`[${this.host}:${this.port}] Connection closed.`);
      }
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 10000);
  }

  private disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }

  private startPolling(): void {
    this.pollTimer = setInterval(async () => {
      if (this.isConnected) {
        try {
          await this.queryOutletStatus();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.log.debug(`[${this.host}:${this.port}] Poll failed: ${message}`);
        }
      }
    }, this.pollIntervalMs);
  }

  /**
   * Filter out Telnet IAC (0xFF) command sequences from buffer.
   */
  private stripTelnetIAC(buffer: Buffer): Buffer {
    const clean: number[] = [];
    let i = 0;
    while (i < buffer.length) {
      if (buffer[i] === 0xFF) { // IAC
        if (i + 1 < buffer.length && buffer[i + 1] === 0xFF) {
          // Escaped 0xFF byte
          clean.push(0xFF);
          i += 2;
        } else if (i + 2 < buffer.length) {
          // 3-byte command like IAC DO/DONT/WILL/WONT
          i += 3;
        } else {
          // Truncated IAC command, skip
          i++;
        }
      } else {
        clean.push(buffer[i]);
        i++;
      }
    }
    return Buffer.from(clean);
  }

  private handleIncomingData(chunk: Buffer): void {
    const cleaned = this.stripTelnetIAC(chunk);
    this.buffer += cleaned.toString('ascii');

    let delimiterIndex: number;
    while ((delimiterIndex = this.buffer.search(/[\r\n]/)) !== -1) {
      const line = this.buffer.substring(0, delimiterIndex).trim();
      this.buffer = this.buffer.substring(delimiterIndex + 1);

      if (line.length > 0) {
        this.processLine(line);
      }
    }
  }

  private processLine(line: string): void {
    this.log.debug(`[${this.host}:${this.port}] RX: ${line}`);

    // Parse status lines starting with $
    // E.g., "$OUTLET1 = ON", "$OUTLET2 = OFF"
    const outletMatch = line.match(/^\$OUTLET([1-8])\s*=\s*(ON|OFF)/i);
    if (outletMatch) {
      const outletNum = parseInt(outletMatch[1], 10);
      const state = outletMatch[2].toUpperCase() === 'ON';
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
  public async setOutlet(outletNumber: number, on: boolean): Promise<boolean> {
    if (outletNumber < 1 || outletNumber > 8) {
      throw new Error(`Invalid outlet number ${outletNumber}. Must be between 1 and 8.`);
    }

    const stateStr = on ? 'ON' : 'OFF';
    const command = `!SWITCH ${outletNumber} ${stateStr}\r`;
    this.log.info(`[${this.host}] Switching Outlet ${outletNumber} -> ${stateStr}`);

    // Update optimistic state
    this.status.outlets[outletNumber] = on;

    await this.sendRaw(command);

    // Give the device 150ms then query status to confirm
    setTimeout(() => {
      this.queryOutletStatus().catch(() => {/* ignore */});
    }, 150);

    return on;
  }

  /**
   * Turn all outlets ON simultaneously.
   */
  public async setAllOn(): Promise<void> {
    this.log.info(`[${this.host}] Executing ALL_ON`);
    await this.sendRaw('!ALL_ON\r');
    for (let i = 1; i <= 8; i++) {
      this.status.outlets[i] = true;
      this.emit('outletChange', i, true);
    }
    setTimeout(() => this.queryOutletStatus().catch(() => {/* ignore */}), 300);
  }

  /**
   * Turn all outlets OFF simultaneously.
   */
  public async setAllOff(): Promise<void> {
    this.log.info(`[${this.host}] Executing ALL_OFF`);
    await this.sendRaw('!ALL_OFF\r');
    for (let i = 1; i <= 8; i++) {
      this.status.outlets[i] = false;
      this.emit('outletChange', i, false);
    }
    setTimeout(() => this.queryOutletStatus().catch(() => {/* ignore */}), 300);
  }

  /**
   * Trigger Reboot 1 sequence.
   */
  public async triggerReboot1(): Promise<void> {
    this.log.info(`[${this.host}] Triggering REBOOT_1`);
    await this.sendRaw('!REBOOT_1\r');
  }

  /**
   * Trigger Reboot 2 sequence.
   */
  public async triggerReboot2(): Promise<void> {
    this.log.info(`[${this.host}] Triggering REBOOT_2`);
    await this.sendRaw('!REBOOT_2\r');
  }

  /**
   * Query outlet status (?OUTLETSTAT).
   */
  public async queryOutletStatus(): Promise<boolean[]> {
    await this.sendRaw('?OUTLETSTAT\r');
    return this.status.outlets.slice(1);
  }

  /**
   * Query device ID (?ID).
   */
  public async queryId(): Promise<void> {
    await this.sendRaw('?ID\r');
  }

  /**
   * Query fault status (?FAULTSTAT).
   */
  public async queryFaults(): Promise<void> {
    await this.sendRaw('?FAULTSTAT\r');
  }

  /**
   * Send raw command over the socket, ensuring socket connection.
   */
  public sendRaw(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        // Try connecting if disconnected
        this.connect();
        return reject(new Error(`Panamax [${this.host}:${this.port}] is not connected.`));
      }

      this.log.debug(`[${this.host}:${this.port}] TX: ${command.trim()}`);
      this.socket.write(command, 'ascii', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
