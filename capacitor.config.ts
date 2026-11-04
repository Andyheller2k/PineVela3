import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.pinevela.mobile',
  appName: 'PineVela',
  webDir: 'dist-mobile',
  loggingBehavior: 'none',
  android: {
    minWebViewVersion: 111,
  },
  server: {
    errorPath: 'webview-update-required.html',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'contain',
    },
  },
};

export default config;
