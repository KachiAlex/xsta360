import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.xsta360.app",
  appName: "Xsta360",
  // The local splash screen HTML is bundled in the app.
  // It shows the animated logo for 3s, then redirects to the VPS server.
  webDir: "out",
  server: {
    // Allow cleartext HTTP (the VPS uses HTTP, not HTTPS yet).
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
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
