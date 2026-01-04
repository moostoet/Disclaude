import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Layer, ConfigProvider } from "effect"
import {
  ClaudeProcess,
  ClaudeProcessError,
  buildClaudeArgs
} from "../../src/Claude/ClaudeProcess.ts"
import { AppConfigLive } from "../../src/Config/index.ts"

describe("buildClaudeArgs", () => {
  it.effect("should build basic args with prompt only", () =>
    Effect.gen(function* () {
      const args = buildClaudeArgs({
        prompt: "Hello world"
      })

      expect(args).toContain("-p")
      expect(args).toContain("Hello world")
      expect(args).toContain("--output-format")
      expect(args).toContain("json")
      expect(args).toContain("--dangerously-skip-permissions")
    })
  )

  it.effect("should include session ID for resume", () =>
    Effect.gen(function* () {
      const args = buildClaudeArgs({
        prompt: "Continue please",
        sessionId: "abc-123-def"
      })

      expect(args).toContain("--resume")
      expect(args).toContain("abc-123-def")
    })
  )

  it.effect("should include allowed tools when provided", () =>
    Effect.gen(function* () {
      const args = buildClaudeArgs({
        prompt: "test",
        allowedTools: ["Read", "Write", "Bash(git:*)"]
      })

      expect(args).toContain("--allowedTools")
      expect(args.some(a => a.includes("Read"))).toBe(true)
    })
  )

  it.effect("should not include empty allowed tools", () =>
    Effect.gen(function* () {
      const args = buildClaudeArgs({
        prompt: "test",
        allowedTools: []
      })

      expect(args).not.toContain("--allowedTools")
    })
  )

  it.effect("should include system prompt when provided", () =>
    Effect.gen(function* () {
      const args = buildClaudeArgs({
        prompt: "test",
        systemPrompt: "You are a helpful assistant"
      })

      expect(args).toContain("--system-prompt")
      expect(args).toContain("You are a helpful assistant")
    })
  )

  it.effect("should include model when provided", () =>
    Effect.gen(function* () {
      const args = buildClaudeArgs({
        prompt: "test",
        model: "sonnet"
      })

      expect(args).toContain("--model")
      expect(args).toContain("sonnet")
    })
  )
})

describe("ClaudeProcessError", () => {
  it.effect("should have correct error tag", () =>
    Effect.gen(function* () {
      const error = new ClaudeProcessError({
        type: "process_error",
        message: "CLI failed"
      })

      expect(error._tag).toBe("ClaudeProcessError")
      expect(error.type).toBe("process_error")
      expect(error.message).toBe("CLI failed")
    })
  )

  it.effect("should include optional exitCode", () =>
    Effect.gen(function* () {
      const error = new ClaudeProcessError({
        type: "process_error",
        message: "CLI failed",
        exitCode: 1
      })

      expect(error.exitCode).toBe(1)
    })
  )
})

describe("ClaudeProcess", () => {
  const TestConfigLayer = AppConfigLive.pipe(
    Layer.provide(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["DISCORD_BOT_TOKEN", "test-token"],
            ["DISCORD_APPLICATION_ID", "test-app-id"],
            ["PROJECTS_BASE_PATH", "/tmp/projects"],
            ["CLAUDE_ALLOWED_TOOLS", "Read,Write"]
          ])
        )
      )
    )
  )

  // Note: Full integration tests would require mocking CommandExecutor
  // or using a test fixture. These tests verify the service structure.

  it.effect("should be constructable with dependencies", () =>
    Effect.gen(function* () {
      // Just verify the layer type-checks and can be referenced
      // Actual execution requires BunContext
      expect(ClaudeProcess.Default).toBeDefined()
    })
  )
})
