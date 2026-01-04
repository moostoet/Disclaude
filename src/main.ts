import { BunRuntime } from "@effect/platform-bun"
import { Config, Effect, Layer, Logger, LogLevel, RuntimeFlags } from "effect"
import { DiscordGatewayLayer } from "./Discord/index.ts"

// Log level configuration based on DEBUG env var
const LogLevelLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const debug = yield* Config.withDefault(Config.boolean("DEBUG"), false)
    const level = debug ? LogLevel.All : LogLevel.Info
    return Logger.minimumLogLevel(level)
  })
)

// Main application layer
export const MainLive = DiscordGatewayLayer.pipe(
  Layer.provide(LogLevelLive),
  Layer.provide(RuntimeFlags.disableRuntimeMetrics)
)

// Entry point - only runs when this file is executed directly
const isMain = import.meta.main

if (isMain) {
  console.log("Starting Disclaude...")

  // Use BunRuntime.runMain for Bun-native execution
  Layer.launch(MainLive).pipe(
    Effect.scoped,
    Effect.provide(Logger.pretty),
    BunRuntime.runMain
  )
}
