// Disclaude - Discord to Claude Code Bridge
// Main entry point

export { MainLive } from "./src/main.ts"
export { AppConfig, AppConfigLive } from "./src/Config/index.ts"
export {
  DiscordApplication,
  DiscordConfigLayer,
  DiscordGatewayLayer,
  DiscordRestLayer
} from "./src/Discord/index.ts"

// Run when executed directly
import "./src/main.ts"