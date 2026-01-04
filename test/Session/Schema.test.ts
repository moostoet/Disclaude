import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { DiscordSession, SessionState } from "../../src/Session/Schema.ts"

describe("SessionState", () => {
  it.effect("should have all required states", () =>
    Effect.gen(function* () {
      expect(SessionState.Idle).toBe("idle")
      expect(SessionState.AwaitingResponse).toBe("awaiting_response")
      expect(SessionState.AwaitingInput).toBe("awaiting_input")
    })
  )

  it.effect("should encode/decode SessionState values", () =>
    Effect.gen(function* () {
      const schema = Schema.Literal("idle", "awaiting_response", "awaiting_input")
      const decode = Schema.decodeUnknownSync(schema)

      expect(decode("idle")).toBe("idle")
      expect(decode("awaiting_response")).toBe("awaiting_response")
      expect(decode("awaiting_input")).toBe("awaiting_input")
    })
  )

  it.effect("should reject invalid SessionState values", () =>
    Effect.gen(function* () {
      const schema = Schema.Literal("idle", "awaiting_response", "awaiting_input")
      const decode = Schema.decodeUnknownSync(schema)

      expect(() => decode("invalid")).toThrow()
    })
  )
})

describe("DiscordSession", () => {
  const validSession = {
    channelId: "123456789",
    threadId: undefined,
    claudeSessionId: undefined,
    projectPath: "/home/user/projects/my-project",
    state: "idle" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  it.effect("should encode a valid session", () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encode(DiscordSession)(validSession)
      expect(encoded.channelId).toBe("123456789")
      expect(encoded.projectPath).toBe("/home/user/projects/my-project")
      expect(encoded.state).toBe("idle")
    })
  )

  it.effect("should decode a valid session", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decode(DiscordSession)(validSession)
      expect(decoded.channelId).toBe("123456789")
      expect(decoded.projectPath).toBe("/home/user/projects/my-project")
      expect(decoded.state).toBe("idle")
    })
  )

  it.effect("should handle optional threadId", () =>
    Effect.gen(function* () {
      const withThread = { ...validSession, threadId: "987654321" }
      const decoded = yield* Schema.decode(DiscordSession)(withThread)
      expect(decoded.threadId).toBe("987654321")
    })
  )

  it.effect("should handle optional claudeSessionId", () =>
    Effect.gen(function* () {
      const withClaudeSession = { ...validSession, claudeSessionId: "claude-session-abc123" }
      const decoded = yield* Schema.decode(DiscordSession)(withClaudeSession)
      expect(decoded.claudeSessionId).toBe("claude-session-abc123")
    })
  )

  it.effect("should fail on missing required fields", () =>
    Effect.gen(function* () {
      const invalid = { channelId: "123" } // missing required fields
      const result = yield* Schema.decodeUnknown(DiscordSession)(invalid).pipe(
        Effect.match({
          onSuccess: () => "success",
          onFailure: () => "failure"
        })
      )
      expect(result).toBe("failure")
    })
  )

  it.effect("should fail on invalid state value", () =>
    Effect.gen(function* () {
      const invalid = { ...validSession, state: "invalid_state" }
      const result = yield* Schema.decodeUnknown(DiscordSession)(invalid).pipe(
        Effect.match({
          onSuccess: () => "success",
          onFailure: () => "failure"
        })
      )
      expect(result).toBe("failure")
    })
  )
})
