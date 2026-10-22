<p align="center">
  <img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

# Homebridge Panamax 4320 Plugin (`homebridge-panamax-4320`)

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

A dynamic platform plugin for [Homebridge](https://homebridge.io) to control **Panamax M4320-PRO** (and **M4315-PRO**) power conditioners over local TCP / Telnet (port 23).

---

## Features

- **Direct Local Network Control:** Fast, reliable communication via raw TCP/Telnet (`Port 23`) directly to the Panamax BlueBOLT card. No cloud connection or external services required.
- **Independent Outlet Control:** Exposes all 8 individual outlets as HomeKit accessories (configurable as `Outlet` or `Switch`).
- **Real-Time Feedback & State Sync:** Listens for unsolicited feedback broadcasts from the Panamax and polls periodically to keep Apple Home in sync when outlets are toggled physically.
- **Customizable Outlets:** Rename outlets, choose between Outlet or Switch accessory type, or hide individual outlets completely from HomeKit.
- **Optional Master Switch:** Adds a master switch to toggle all outlets ON or OFF simultaneously.
- **Optional Reboot Switches:** Exposes Reboot 1 and Reboot 2 as momentary buttons in HomeKit to trigger power-cycling sequences.
- **Homebridge Config UI X Support:** Full visual schema configuration with tabs and tables.
- **Built-in Swift Diagnostic Tool:** Includes a native macOS CLI tool in the repository for direct troubleshooting and testing from terminal or Xcode.

---

## Supported Hardware

- **Panamax M4320-PRO**
- **Panamax M4315-PRO**
- Equipped with **BlueBOLT-CV1** or **BlueBOLT-CV2** network card (Port 23 Telnet enabled).

---

## Installation

### Via Homebridge UI
Search for `homebridge-panamax-4320` in the **Plugins** tab of Homebridge Config UI X and click **Install**.

### Via Terminal
```bash
npm install -g homebridge-panamax-4320
```

### Developing or Linking Locally
If you cloned this repository and want to run it directly in your local Homebridge instance:
```bash
cd /path/to/Panamax4320ProHomebridge
npm install
npm run build
npm link
```
In your Homebridge environment:
```bash
npm link homebridge-panamax-4320
```

---

## Configuration

### Example `config.json`

```json
{
  "platforms": [
    {
      "platform": "Panamax4320",
      "name": "Panamax 4320",
      "devices": [
        {
          "name": "Rack Power Conditioner",
          "host": "192.168.1.50",
          "port": 23,
          "pollInterval": 10,
          "enableAllOutletsSwitch": true,
          "enableRebootButtons": false,
          "outlets": [
            { "index": 1, "name": "AV Receiver", "enabled": true, "accessoryType": "Outlet" },
            { "index": 2, "name": "Apple TV", "enabled": true, "accessoryType": "Outlet" },
            { "index": 3, "name": "Subwoofer", "enabled": true, "accessoryType": "Switch" },
            { "index": 4, "name": "Turntable", "enabled": true, "accessoryType": "Switch" },
            { "index": 5, "name": "Game Console", "enabled": true, "accessoryType": "Outlet" },
            { "index": 6, "name": "Network Switch", "enabled": false },
            { "index": 7, "name": "Modem", "enabled": false },
            { "index": 8, "name": "Access Point", "enabled": false }
          ]
        }
      ]
    }
  ]
}
```

### Configuration Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `platform` | `string` | **Yes** | `"Panamax4320"` | Platform identifier |
| `name` | `string` | **Yes** | `"Panamax 4320"` | Display name for the platform |
| `devices` | `array` | **Yes** | `[]` | List of Panamax units to control |
| `devices[].name` | `string` | **Yes** | `"Panamax 4320"` | Name prefix for the device |
| `devices[].host` | `string` | **Yes** | — | IP address or hostname of the Panamax unit |
| `devices[].port` | `integer` | No | `23` | TCP port (default is 23) |
| `devices[].pollInterval` | `integer` | No | `10` | Status polling interval in seconds |
| `devices[].enableAllOutletsSwitch` | `boolean` | No | `false` | Expose a master switch to turn all outlets on/off |
| `devices[].enableRebootButtons` | `boolean` | No | `false` | Expose Reboot 1 / Reboot 2 buttons |
| `devices[].outlets` | `array` | No | `[]` | Custom outlet settings (index 1–8) |
| `devices[].outlets[].index` | `integer` | **Yes** | — | Outlet number (1 through 8) |
| `devices[].outlets[].name` | `string` | No | `"Outlet N"` | Custom name for the outlet |
| `devices[].outlets[].enabled` | `boolean` | No | `true` | Set to `false` to hide this outlet |
| `devices[].outlets[].accessoryType` | `string` | No | `"Outlet"` | Display as `"Outlet"` or `"Switch"` |

---

## macOS Swift Diagnostic Tool

The repository also includes a native Swift CLI executable in the Xcode project (`Panamax4320ProHomebridge.xcodeproj`).

You can run it from Xcode or compile from terminal to test communication with your device:
```bash
# Query all outlet states
./Products/Panamax4320ProHomebridge --host 192.168.1.50 --status

# Query device identity and firmware
./Products/Panamax4320ProHomebridge --host 192.168.1.50 --id

# Switch Outlet 1 ON or OFF
./Products/Panamax4320ProHomebridge --host 192.168.1.50 --switch 1 ON
./Products/Panamax4320ProHomebridge --host 192.168.1.50 --switch 1 OFF
```

---

## License

This project is licensed under the Apache 2.0 License.
