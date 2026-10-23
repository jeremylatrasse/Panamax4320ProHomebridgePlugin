"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const settings_1 = require("./settings");
const platform_1 = require("./platform");
/**
 * Entry point for Homebridge to load the plugin.
 */
exports.default = (api) => {
    api.registerPlatform(settings_1.PLATFORM_NAME, platform_1.Panamax43xxPlatform);
    // Also register legacy alias to ensure seamless compatibility with existing configurations
    api.registerPlatform('Panamax4320', platform_1.Panamax43xxPlatform);
};
//# sourceMappingURL=index.js.map