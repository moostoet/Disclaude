import { describe, it, expect } from "@effect/vitest"
import { Effect, ConfigProvider, Layer, Redacted } from "effect"
import * as DfxConfig from "dfx/DiscordConfig"
import { DiscordConfigLayer } from "../../src/Discord/DiscordConfig.ts"

describe("DiscordConfig", () => {
  const testConfigProvider = ConfigProvider.fromMap(
    new Map([
      ["DISCORD_BOT_TOKEN", "test-discord-token"]
    ])
  )

  const TestLayer = DiscordConfigLayer.pipe(
    Layer.provide(Layer.setConfigProvider(testConfigProvider))
  )

  it.effect("creates DiscordConfig with token from environment", () =>
    Effect.gen(function* () {
      const config = yield* DfxConfig.DiscordConfig
      const token = Redacted.value(config.token)
      expect(token).toBe("test-discord-token")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("configures gateway with required intents", () =>
    Effect.gen(function* () {
      const config = yield* DfxConfig.DiscordConfig
      // Intents should be a number (bitfield)
      expect(typeof config.gateway.intents).toBe("number")
      // Should have some intents set (non-zero)
      expect(config.gateway.intents).toBeGreaterThan(0)
    }).pipe(Effect.provide(TestLayer))
  )
})
