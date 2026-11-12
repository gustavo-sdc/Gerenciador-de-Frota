import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.gestaodefrota.app",
  appName: "Garagem",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;
