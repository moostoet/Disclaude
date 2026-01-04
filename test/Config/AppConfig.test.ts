import { describe, it, expect } from "@effect/vitest"
import { Effect, ConfigProvider, Layer, Redacted } from "effect"
import { AppConfig, AppConfigLive } from "../../src/Config/index.ts"

describe("AppConfig", () => {
  const testConfigProvider = ConfigProvider.fromMap(
    new Map([
      ["DISCORD_BOT_TOKEN", "test-token-123"],
      ["DISCORD_APPLICATION_ID", "app-id-456"],
      ["PROJECTS_BASE_PATH", "/home/test/projects"]
    ])
  )

  const TestLayer = AppConfigLive.pipe(
    Layer.provide(Layer.setConfigProvider(testConfigProvider))
  )

  it.effect("loads Discord bot token as redacted", () =>
    Effect.gen(function* () {
      const config = yield* AppConfig
      const token = Redacted.value(config.discordBotToken)
      expect(token).toBe("test-token-123")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("loads Discord application ID", () =>
    Effect.gen(function* () {
      const config = yield* AppConfig
      expect(config.discordApplicationId).toBe("app-id-456")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("loads projects base path", () =>
    Effect.gen(function* () {
      const config = yield* AppConfig
      expect(config.projectsBasePath).toBe("/home/test/projects")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("uses default projects base path when not provided", () =>
    Effect.gen(function* () {
      const config = yield* AppConfig
      expect(config.projectsBasePath).toBe("~/projects")
    }).pipe(
      Effect.provide(
        AppConfigLive.pipe(
          Layer.provide(
            Layer.setConfigProvider(
              ConfigProvider.fromMap(
                new Map([
                  ["DISCORD_BOT_TOKEN", "token"],
                  ["DISCORD_APPLICATION_ID", "app-id"]
                ])
              )
            )
          )
        )
      )
    )
  )

  it.effect("loads allowed tools when provided", () =>
    Effect.gen(function* () {
      const config = yield* AppConfig
      expect(config.claudeAllowedTools).toEqual(["Read", "Write", "Bash"])
    }).pipe(
      Effect.provide(
        AppConfigLive.pipe(
          Layer.provide(
            Layer.setConfigProvider(
              ConfigProvider.fromMap(
                new Map([
                  ["DISCORD_BOT_TOKEN", "token"],
                  ["DISCORD_APPLICATION_ID", "app-id"],
                  ["CLAUDE_ALLOWED_TOOLS", "Read,Write,Bash"]
                ])
              )
            )
          )
        )
      )
    )
  )

  it.effect("returns empty array for allowed tools when not provided", () =>
    Effect.gen(function* () {
      const config = yield* AppConfig
      expect(config.claudeAllowedTools).toEqual([])
    }).pipe(
      Effect.provide(
        AppConfigLive.pipe(
          Layer.provide(
            Layer.setConfigProvider(
              ConfigProvider.fromMap(
                new Map([
                  ["DISCORD_BOT_TOKEN", "token"],
                  ["DISCORD_APPLICATION_ID", "app-id"]
                ])
              )
            )
          )
        )
      )
    )
  )
})
