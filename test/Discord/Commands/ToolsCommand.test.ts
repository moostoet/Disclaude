import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Layer, Option, ConfigProvider } from "effect"
import { AppConfig, AppConfigLive } from "../../../src/Config/index.ts"

describe("ToolsCommand", () => {
  describe("tools configuration", () => {
    it.effect("should read allowed tools from config", () =>
      Effect.gen(function* () {
        const config = yield* AppConfig
        // Default is empty array
        expect(Array.isArray(config.claudeAllowedTools)).toBe(true)
      }).pipe(
        Effect.provide(
          AppConfigLive.pipe(
            Layer.provide(
              Layer.setConfigProvider(
                ConfigProvider.fromMap(
                  new Map([
                    ["DISCORD_BOT_TOKEN", "test"],
                    ["DISCORD_APPLICATION_ID", "test"]
                  ])
                )
              )
            )
          )
        )
      )
    )

    it.effect("should parse comma-separated tools", () =>
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
                    ["DISCORD_BOT_TOKEN", "test"],
                    ["DISCORD_APPLICATION_ID", "test"],
                    ["CLAUDE_ALLOWED_TOOLS", "Read, Write, Bash"]
                  ])
                )
              )
            )
          )
        )
      )
    )
  })

  describe("tools formatting", () => {
    it("should format tool list for display", () => {
      const tools = ["Read", "Write", "Bash", "Glob"]
      const formatted = tools.map((t) => `• ${t}`).join("\n")
      expect(formatted).toBe("• Read\n• Write\n• Bash\n• Glob")
    })

    it("should handle empty tool list", () => {
      const tools: string[] = []
      const message =
        tools.length === 0
          ? "No tool restrictions configured. All tools are allowed."
          : tools.map((t) => `• ${t}`).join("\n")
      expect(message).toBe("No tool restrictions configured. All tools are allowed.")
    })
  })
})
