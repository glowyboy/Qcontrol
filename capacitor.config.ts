import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qcontrol.mobile',
  appName: 'Q-Control',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
};

export default config;
