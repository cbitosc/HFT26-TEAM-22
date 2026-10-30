import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.sanket.mesh',
  appName: 'Sanket',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    minWebViewVersion: 60,
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    NearbyMesh: {
      serviceId: 'org.sanket.mesh.p2p.cluster',
      strategy: 'P2P_CLUSTER',
      foregroundNotificationTitle: 'Sanket mesh active',
      foregroundNotificationBody: 'Relaying encrypted emergency packets nearby',
    },
  },
};

export default config;
