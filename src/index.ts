import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { Panamax4320Platform } from './platform';

/**
 * Entry point for Homebridge to load the plugin.
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, Panamax4320Platform);
};
