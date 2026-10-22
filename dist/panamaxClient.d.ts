import { EventEmitter } from 'events';
import { Logger } from 'homebridge';
export interface PanamaxClientConfig {
    host: string;
    port: number;
    pollInterval?: number;
    timeout?: number;
}
export interface PanamaxDeviceStatus {
    outlets: boolean[];
    model?: string;
    firmware?: string;
    faults?: Record<string, string>;
}
export declare class PanamaxClient extends EventEmitter {
    private readonly log;
    private socket;
    private isConnected;
    private isConnecting;
    private reconnectTimer;
    private pollTimer;
    private buffer;
    status: PanamaxDeviceStatus;
    private readonly host;
    private readonly port;
    private readonly pollIntervalMs;
    private readonly timeoutMs;
    constructor(config: PanamaxClientConfig, log: Logger);
    start(): void;
    stop(): void;
    private connect;
    private scheduleReconnect;
    private disconnect;
    private startPolling;
    /**
     * Filter out Telnet IAC (0xFF) command sequences from buffer.
     */
    private stripTelnetIAC;
    private handleIncomingData;
    private processLine;
    /**
     * Switch a specific outlet (1..8) ON or OFF.
     */
    setOutlet(outletNumber: number, on: boolean): Promise<boolean>;
    /**
     * Turn all outlets ON simultaneously.
     */
    setAllOn(): Promise<void>;
    /**
     * Turn all outlets OFF simultaneously.
     */
    setAllOff(): Promise<void>;
    /**
     * Trigger Reboot 1 sequence.
     */
    triggerReboot1(): Promise<void>;
    /**
     * Trigger Reboot 2 sequence.
     */
    triggerReboot2(): Promise<void>;
    /**
     * Query outlet status (?OUTLETSTAT).
     */
    queryOutletStatus(): Promise<boolean[]>;
    /**
     * Query device ID (?ID).
     */
    queryId(): Promise<void>;
    /**
     * Query fault status (?FAULTSTAT).
     */
    queryFaults(): Promise<void>;
    /**
     * Send raw command over the socket, ensuring socket connection.
     */
    sendRaw(command: string): Promise<void>;
}
