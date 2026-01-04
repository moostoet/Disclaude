import { describe, it, expect } from "@effect/vitest"
import { Effect, Layer, ConfigProvider } from "effect"
import { DiscordGatewayLayer, DiscordRestLayer } from "../../src/Discord/DiscordGateway.ts"

describe("DiscordGateway", () => {
  // These tests verify the layer structure compiles correctly
  // Actual gateway connection tests require a valid Discord token

  it("exports DiscordGatewayLayer", () => {
    expect(DiscordGatewayLayer).toBeDefined()
    expect(Layer.isLayer(DiscordGatewayLayer)).toBe(true)
  })

  it("exports DiscordRestLayer", () => {
    expect(DiscordRestLayer).toBeDefined()
    expect(Layer.isLayer(DiscordRestLayer)).toBe(true)
  })

  it.effect("DiscordRestLayer requires DISCORD_BOT_TOKEN", () =>
    Effect.gen(function* () {
      // Attempting to build without token should fail with config error
      const exit = yield* Effect.exit(
        Layer.buildWithScope(DiscordRestLayer, yield* Effect.scope)
      )
      // Should fail because no token is provided
      expect(exit._tag).toBe("Failure")
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.setConfigProvider(ConfigProvider.fromMap(new Map())))
    )
  )
})
