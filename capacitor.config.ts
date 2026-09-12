import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.xsta360.app",
  appName: "Xsta360",
  // Local shell that redirects to the live app when online.
  // When offline, shows a branded offline page with auto-retry.
  // The service worker on xsta360.com.ng handles caching after first visit.
  webDir: "out",
  android: {
    // captureInput keeps the virtual keyboard from covering focused fields.
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: "#1e2a22",
      splashFullScreen: true,
      splashImmersive: true,
      autoHide: true,
    },
  },
};

export default config;
