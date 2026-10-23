<p align="center">
  <img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

# Homebridge Panamax 4320 Plugin (`homebridge-panamax-4320`)

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

A dynamic platform plugin for [Homebridge](https://homebridge.io) to control **Panamax M4320-PRO** (and **M4315-PRO**) power conditioners over local TCP / Telnet (port 23).

---

## Features

- **Single Child Bridge for All Units:** Publishes all your configured Panamax units together on **one child bridge** rather than cluttering your setup with separate bridges per device.
- **Clean Unified Device Layout:** By default, each Panamax unit is published as **one unified accessory** containing all 8 outlets as individual services with distinct names. In Apple Home, you can view the unit as a single tidy tile or choose "Show as Separate Tiles".
- **Unique Multi-Device Identification:** Easily configure multiple Panamax power conditioners (e.g., *AV Rack*, *Living Room*, *Studio*) with unique names, persistent IDs, and distinct tabs in Homebridge Config UI X.
- **Direct Local Network Control:** Fast, reliable communication via raw TCP/Telnet (`Port 23`) directly to the Panamax BlueBOLT card. No cloud connection or external services required.
- **Smart Hardware Switching Delay:** Includes a configurable 30-second outlet switching delay window. When toggling outlets in Apple Home, HomeKit acknowledges the press immediately so buttons never time out, while background polls prevent premature hardware state readings from snapping buttons back before power sequencing completes.
- **Real-Time Feedback & State Sync:** Listens for unsolicited feedback broadcasts from the Panamax and polls periodically to keep Apple Home in sync when outlets are toggled physically.
- **Customizable Outlets:** Rename outlets, choose between `Outlet` or `Switch` service types, or hide unneeded outlets completely from HomeKit.
- **Optional Master Switch:** Adds a master switch to toggle all outlets ON or OFF simultaneously.
- **Optional Reboot Switches:** Exposes Reboot 1 and Reboot 2 as momentary buttons in HomeKit to trigger power-cycling sequences.
- **Homebridge Config UI X Support:** Full visual schema configuration with tabs, tooltips, and outlet tables.
- **Built-in Swift Diagnostic Tool:** Includes a native macOS CLI tool in the repository for direct troubleshooting and testing from terminal or Xcode.

---

## Supported Hardware

- **Panamax M4320-PRO**
- **Panamax M4315-PRO**
- Equipped with **BlueBOLT-CV1** or **BlueBOLT-CV2** network card (Port 23 Telnet enabled).

---

## Running as a Single Child Bridge

Homebridge child bridges run plugins in an isolated process with their own HomeKit pairing code. Because this plugin is a **Dynamic Platform**, **all Panamax devices configured under this platform are published together on 1 single child bridge**:

1. In the **Homebridge Config UI X** dashboard, go to the **Plugins** tab.
2. Find the **Panamax 4320** plugin card.
3. Click the **Wrench icon** (Settings) -> **Bridge Settings**.
4. Toggle **Run as Child Bridge** and click **Save**.
5. Restart Homebridge.
6. Scan the single QR code shown on the dashboard to pair all your Panamax devices into Apple Home at once!

---

## Configuration

### Example `config.json` with Multiple Units

```json
{
  "platforms": [
    {
      "platform": "Panamax4320",
      "name": "Panamax 4320",
      "_bridge": {
        "username": "0E:43:20:AA:BB:CC",
        "port": 51820
      },
      "devices": [
        {
          "name": "AV Rack 4320",
          "id": "rack-panamax-01",
          "host": "192.168.1.50",
          "port": 23,
          "pollInterval": 10,
          "delay": 30,
          "accessoryMode": "device",
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
        },
        {
          "name": "Living Room Media",
          "id": "living-room-panamax-02",
          "host": "192.168.1.51",
          "port": 23,
          "pollInterval": 10,
          "delay": 30,
          "accessoryMode": "device",
          "enableAllOutletsSwitch": false,
          "enableRebootButtons": false,
          "outlets": [
            { "index": 1, "name": "TV OLED", "enabled": true, "accessoryType": "Outlet" },
            { "index": 2, "name": "Soundbar", "enabled": true, "accessoryType": "Outlet" }
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
| `name` | `string` | **Yes** | `"Panamax 4320"` | Platform instance name in Homebridge |
| `devices` | `array` | **Yes** | `[]` | List of Panamax hardware units to manage |
| `devices[].name` | `string` | **Yes** | — | Unique, identifiable name for the unit (e.g. *"AV Rack 4320"*) |
| `devices[].id` | `string` | No | — | Optional unique ID to keep persistent HomeKit pairing if IP changes |
| `devices[].host` | `string` | **Yes** | — | IP address or hostname of the Panamax unit |
| `devices[].port` | `integer` | No | `23` | TCP port (default is 23) |
| `devices[].pollInterval` | `integer` | No | `10` | Status polling interval in seconds |
| `devices[].delay` | `integer` | No | `30` | Delay in seconds per outlet for hardware power sequencing and relay switching before verifying status |
| `devices[].accessoryMode` | `string` | No | `"device"` | `"device"` (1 unified accessory per unit) or `"individual"` (separate accessory per outlet) |
| `devices[].enableAllOutletsSwitch` | `boolean` | No | `false` | Expose a master switch to turn all outlets on/off |
| `devices[].enableRebootButtons` | `boolean` | No | `false` | Expose Reboot 1 / Reboot 2 buttons |
| `devices[].outlets` | `array` | No | `[]` | Custom outlet settings (index 1–8) |
| `devices[].outlets[].index` | `integer` | **Yes** | — | Outlet number (1 through 8) |
| `devices[].outlets[].name` | `string` | No | `"Outlet N"` | Custom name for the outlet |
| `devices[].outlets[].enabled` | `boolean` | No | `true` | Set to `false` to hide this outlet |
| `devices[].outlets[].accessoryType` | `string` | No | `"Outlet"` | Display as `"Outlet"` or `"Switch"` |

---

## macOS Swift Diagnostic Tool

The repository includes a native Swift CLI executable in the Xcode project (`Panamax4320ProHomebridge.xcodeproj`).

You can run it from Xcode or terminal to test communication with your device:
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
