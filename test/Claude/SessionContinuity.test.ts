import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Option, Layer, ConfigProvider } from "effect"
import { SessionContinuity } from "../../src/Claude/SessionContinuity.ts"
import { SessionStore } from "../../src/Session/SessionStore.ts"

describe("SessionContinuity", () => {
  // Provide both SessionStore and SessionContinuity, sharing the store
  const TestLayer = Layer.mergeAll(
    SessionStore.Default,
    SessionContinuity.Default
  )

  describe("getClaudeSessionId", () => {
    it.effect("should return None when no session exists", () =>
      Effect.gen(function* () {
        const continuity = yield* SessionContinuity
        const sessionId = yield* continuity.getClaudeSessionId("channel-unknown")

        expect(Option.isNone(sessionId)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should return None when session exists but no Claude session", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const continuity = yield* SessionContinuity

        // Create session without Claude session ID
        yield* store.create("channel-123", "/path/to/project")

        const sessionId = yield* continuity.getClaudeSessionId("channel-123")
        expect(Option.isNone(sessionId)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should return Some when Claude session exists", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const continuity = yield* SessionContinuity

        // Create and update session with Claude session ID
        yield* store.create("channel-123", "/path/to/project")
        yield* store.update("channel-123", (s) => ({
          ...s,
          claudeSessionId: "claude-abc-123"
        }))

        const sessionId = yield* continuity.getClaudeSessionId("channel-123")
        expect(Option.isSome(sessionId)).toBe(true)
        if (Option.isSome(sessionId)) {
          expect(sessionId.value).toBe("claude-abc-123")
        }
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("storeClaudeSessionId", () => {
    it.effect("should create session if not exists and store ID", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const continuity = yield* SessionContinuity

        yield* continuity.storeClaudeSessionId(
          "channel-new",
          "/path/to/project",
          "claude-new-session"
        )

        const session = yield* store.get("channel-new")
        expect(Option.isSome(session)).toBe(true)
        if (Option.isSome(session)) {
          expect(session.value.claudeSessionId).toBe("claude-new-session")
          expect(session.value.projectPath).toBe("/path/to/project")
        }
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should update existing session with new Claude ID", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const continuity = yield* SessionContinuity

        // Create initial session
        yield* store.create("channel-123", "/original/path")

        // Store Claude session ID
        yield* continuity.storeClaudeSessionId(
          "channel-123",
          "/original/path",
          "claude-updated-session"
        )

        const session = yield* store.get("channel-123")
        expect(Option.isSome(session)).toBe(true)
        if (Option.isSome(session)) {
          expect(session.value.claudeSessionId).toBe("claude-updated-session")
        }
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("updateSessionState", () => {
    it.effect("should update session state to awaiting_response", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const continuity = yield* SessionContinuity

        yield* store.create("channel-123", "/path")
        yield* continuity.updateSessionState("channel-123", "awaiting_response")

        const session = yield* store.get("channel-123")
        expect(Option.isSome(session)).toBe(true)
        if (Option.isSome(session)) {
          expect(session.value.state).toBe("awaiting_response")
        }
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should update session state to idle", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const continuity = yield* SessionContinuity

        yield* store.create("channel-123", "/path")
        yield* continuity.updateSessionState("channel-123", "awaiting_response")
        yield* continuity.updateSessionState("channel-123", "idle")

        const session = yield* store.get("channel-123")
        expect(Option.isSome(session)).toBe(true)
        if (Option.isSome(session)) {
          expect(session.value.state).toBe("idle")
        }
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("clearSession", () => {
    it.effect("should clear Claude session ID but keep Discord session", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const continuity = yield* SessionContinuity

        // Create session with Claude ID
        yield* store.create("channel-123", "/path")
        yield* store.update("channel-123", (s) => ({
          ...s,
          claudeSessionId: "claude-abc"
        }))

        // Clear Claude session
        yield* continuity.clearSession("channel-123")

        const session = yield* store.get("channel-123")
        expect(Option.isSome(session)).toBe(true)
        if (Option.isSome(session)) {
          // Discord session still exists
          expect(session.value.channelId).toBe("channel-123")
          // But Claude session is cleared
          expect(session.value.claudeSessionId).toBeUndefined()
          expect(session.value.state).toBe("idle")
        }
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should not fail when clearing non-existent session", () =>
      Effect.gen(function* () {
        const continuity = yield* SessionContinuity
        // Should not throw
        yield* continuity.clearSession("non-existent")
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
