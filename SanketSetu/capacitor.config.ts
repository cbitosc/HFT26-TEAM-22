import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.sanket.mesh',
  appName: 'Sanket',
  webDir: 'dist',
  // Light WebView background so launch never flashes dark before the app paints.
  backgroundColor: '#F7F8FA',
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
    // Web content stays below the status bar and above the gesture bar; the app reads the insets
    // from the injected --safe-area-inset-* CSS variables (src/ui/tokens.css).
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    NearbyMesh: {
      serviceId: 'org.sanket.mesh.p2p.cluster',
      strategy: 'P2P_CLUSTER',
      foregroundNotificationTitle: 'Sanket mesh active',
      foregroundNotificationBody: 'Relaying encrypted emergency packets nearby',
    },
  },
};

export default config;
