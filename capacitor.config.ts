import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.xsta360.app",
  appName: "Xsta360",
  // Local splash screen / offline fallback bundled in the app.
  webDir: "out",
  server: {
    // Load the live app directly inside the Capacitor webview.
    // This keeps the user in the app instead of opening the system browser.
    url: "https://xsta360.67-211-210-8.sslip.io/login",
  },
  android: {
    // captureInput keeps the virtual keyboard from covering focused fields.
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#1e2a22",
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
