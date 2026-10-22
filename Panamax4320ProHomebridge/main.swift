//
//  main.swift
//  Panamax4320ProHomebridge
//
//  A macOS Swift utility to test and communicate with Panamax M4320-PRO
//  power conditioners over raw TCP / Telnet (port 23).
//

import Foundation
import Network
import os

/// Actor responsible for TCP communication with a Panamax M4320-PRO unit.
actor PanamaxSwiftClient {
    private let host: String
    private let port: UInt16
    private var connection: NWConnection?
    private var isConnected = false

    init(host: String, port: UInt16 = 23) {
        self.host = host
        self.port = port
    }

    /// Connects to the device using Apple Network framework.
    func connect() async throws {
        let endpoint = NWEndpoint.Host(host)
        let nwPort = NWEndpoint.Port(rawValue: port) ?? .init(integerLiteral: 23)
        let parameters = NWParameters.tcp

        let conn = NWConnection(host: endpoint, port: nwPort, using: parameters)
        self.connection = conn

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let isResumed = OSAllocatedUnfairLock(initialState: false)

            conn.stateUpdateHandler = { state in
                let shouldResume = {
                    isResumed.withLock { resumed in
                        guard !resumed else { return false }
                        resumed = true
                        return true
                    }
                }

                switch state {
                case .ready:
                    if shouldResume() {
                        continuation.resume()
                    }
                case .failed(let error):
                    if shouldResume() {
                        continuation.resume(throwing: error)
                    }
                case .cancelled:
                    if shouldResume() {
                        continuation.resume(throwing: NSError(domain: "Panamax", code: -1, userInfo: [NSLocalizedDescriptionKey: "Connection cancelled"]))
                    }
                default:
                    break
                }
            }

            conn.start(queue: .global())
        }

        self.isConnected = true
    }

    /// Sends a raw command and receives lines.
    func sendCommand(_ command: String) async throws -> String {
        guard let conn = connection else {
            throw NSError(domain: "Panamax", code: -2, userInfo: [NSLocalizedDescriptionKey: "Not connected"])
        }

        let formatted = command.hasSuffix("\r") ? command : "\(command)\r"
        guard let data = formatted.data(using: .ascii) else {
            throw NSError(domain: "Panamax", code: -3, userInfo: [NSLocalizedDescriptionKey: "Invalid command data"])
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            conn.send(content: data, completion: .contentProcessed { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            })
        }

        // Receive response
        return try await withCheckedThrowingContinuation { continuation in
            conn.receive(minimumIncompleteLength: 1, maximumLength: 4096) { content, _, _, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let content = content, let str = String(data: content, encoding: .ascii) {
                    continuation.resume(returning: str)
                } else {
                    continuation.resume(returning: "")
                }
            }
        }
    }

    /// Disconnects the socket.
    func disconnect() {
        connection?.cancel()
        connection = nil
        isConnected = false
    }
}

// MARK: - CLI Logic

struct PanamaxCLI {
    static func run() async {
        let args = ProcessInfo.processInfo.arguments

        print("=== Panamax M4320-PRO Diagnostic Utility ===")

        guard args.count >= 2 else {
            printUsage()
            return
        }

        var host: String?
        var port: UInt16 = 23
        var command: String = "?OUTLETSTAT"

        var i = 1
        while i < args.count {
            switch args[i] {
            case "--host", "-h":
                if i + 1 < args.count {
                    host = args[i + 1]
                    i += 1
                }
            case "--port", "-p":
                if i + 1 < args.count, let p = UInt16(args[i + 1]) {
                    port = p
                    i += 1
                }
            case "--status":
                command = "?OUTLETSTAT"
            case "--id":
                command = "?ID"
            case "--faults":
                command = "?FAULTSTAT"
            case "--switch":
                if i + 2 < args.count {
                    let outlet = args[i + 1]
                    let state = args[i + 2].uppercased()
                    command = "!SWITCH \(outlet) \(state)"
                    i += 2
                }
            case "--raw":
                if i + 1 < args.count {
                    command = args[i + 1]
                    i += 1
                }
            default:
                break
            }
            i += 1
        }

        guard let targetHost = host else {
            print("Error: --host <IP or hostname> is required.\n")
            printUsage()
            return
        }

        print("Connecting to \(targetHost):\(port)...")
        let client = PanamaxSwiftClient(host: targetHost, port: port)

        do {
            try await client.connect()
            print("Connected! Sending command: \(command)")
            let response = try await client.sendCommand(command)
            print("--- Response ---")
            print(response.trimmingCharacters(in: .whitespacesAndNewlines))
            print("----------------")
            await client.disconnect()
        } catch {
            print("Communication error: \(error.localizedDescription)")
        }
    }

    static func printUsage() {
        print("""
        Usage:
          Panamax4320ProHomebridge --host <ip> [options]

        Options:
          --host, -h <ip>         Device IP address (e.g. 192.168.1.50)
          --port, -p <port>       Port (default: 23)
          --status                Query outlet states (?OUTLETSTAT)
          --id                    Query device model & firmware (?ID)
          --faults                Query fault conditions (?FAULTSTAT)
          --switch <1-8> <ON|OFF> Switch an outlet ON or OFF
          --raw "<command>"       Send arbitrary raw command (e.g. '!ALL_ON')

        Homebridge Plugin Note:
          The Homebridge plugin source is located in the root repository.
          See README.md for installation into your Homebridge instance.
        """)
    }
}

// Top-level entrypoint in main.swift
await PanamaxCLI.run()
