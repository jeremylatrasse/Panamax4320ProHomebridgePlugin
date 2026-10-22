import { PanamaxClient } from './dist/panamaxClient.js';

// Dummy logger for standalone testing
const logger = {
  info: (msg) => console.log('[INFO]', msg),
  warn: (msg) => console.warn('[WARN]', msg),
  error: (msg) => console.error('[ERROR]', msg),
  debug: (msg) => console.log('[DEBUG]', msg),
};

const client = new PanamaxClient(
  {
    host: '192.168.1.0', // <-- Replace with your Panamax IP
    port: 23,
    pollInterval: 5,
  },
  logger,
);

client.on('connected', () => console.log(' Connected to Panamax!'));
client.on('outletChange', (outlet, state) => console.log(`Outlet ${outlet} -> ${state ? 'ON' : 'OFF'}`));
client.on('info', (info) => console.log('Device Info:', info));

client.start();

// After 5 seconds, query outlet status
setTimeout(async () => {
  console.log('Querying outlet status...');
  const status = await client.queryOutletStatus();
  console.log('Current status:', status);
}, 5000);
