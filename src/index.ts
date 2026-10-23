import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { Panamax43xxPlatform } from './platform';

/**
 * Entry point for Homebridge to load the plugin.
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, Panamax43xxPlatform);
  // Also register legacy alias to ensure seamless compatibility with existing configurations
  api.registerPlatform('Panamax4320', Panamax43xxPlatform);
};
