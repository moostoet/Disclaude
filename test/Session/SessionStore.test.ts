import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { SessionStore } from "../../src/Session/SessionStore.ts"

describe("SessionStore", () => {
  const testProjectPath = "/home/user/projects/test-project"

  describe("create", () => {
    it.effect("should create a new session for a channel", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const session = yield* store.create("channel-123", testProjectPath)

        expect(session.channelId).toBe("channel-123")
        expect(session.projectPath).toBe(testProjectPath)
        expect(session.state).toBe("idle")
        expect(session.claudeSessionId).toBeUndefined()
        expect(session.createdAt).toBeDefined()
        expect(session.updatedAt).toBeDefined()
      }).pipe(Effect.provide(SessionStore.Default))
    )

    it.effect("should create a session with optional threadId", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const session = yield* store.create("channel-123", testProjectPath, "thread-456")

        expect(session.channelId).toBe("channel-123")
        expect(session.threadId).toBe("thread-456")
      }).pipe(Effect.provide(SessionStore.Default))
    )
  })

  describe("get", () => {
    it.effect("should return None for non-existent session", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const result = yield* store.get("non-existent")

        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(SessionStore.Default))
    )

    it.effect("should return Some for existing session", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        yield* store.create("channel-123", testProjectPath)
        const result = yield* store.get("channel-123")

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value.channelId).toBe("channel-123")
        }
      }).pipe(Effect.provide(SessionStore.Default))
    )
  })

  describe("getOrCreate", () => {
    it.effect("should create session if not exists", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const session = yield* store.getOrCreate("channel-new", testProjectPath)

        expect(session.channelId).toBe("channel-new")
        expect(session.projectPath).toBe(testProjectPath)
      }).pipe(Effect.provide(SessionStore.Default))
    )

    it.effect("should return existing session if exists", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const original = yield* store.create("channel-123", testProjectPath)
        const retrieved = yield* store.getOrCreate("channel-123", "/different/path")

        // Should return original, not create new with different path
        expect(retrieved.projectPath).toBe(testProjectPath)
        expect(retrieved.createdAt).toBe(original.createdAt)
      }).pipe(Effect.provide(SessionStore.Default))
    )
  })

  describe("update", () => {
    it.effect("should update an existing session", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        yield* store.create("channel-123", testProjectPath)

        const updated = yield* store.update("channel-123", (session) => ({
          ...session,
          state: "awaiting_response" as const,
          claudeSessionId: "claude-abc123"
        }))

        expect(updated.state).toBe("awaiting_response")
        expect(updated.claudeSessionId).toBe("claude-abc123")
        // Verify updatedAt is a valid ISO string (timing can make it equal to createdAt)
        expect(new Date(updated.updatedAt).toISOString()).toBe(updated.updatedAt)
      }).pipe(Effect.provide(SessionStore.Default))
    )

    it.effect("should fail when updating non-existent session", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const result = yield* store.update("non-existent", (s) => s).pipe(
          Effect.match({
            onSuccess: () => "success",
            onFailure: () => "failure"
          })
        )

        expect(result).toBe("failure")
      }).pipe(Effect.provide(SessionStore.Default))
    )
  })

  describe("delete", () => {
    it.effect("should delete an existing session", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        yield* store.create("channel-123", testProjectPath)
        yield* store.delete("channel-123")

        const result = yield* store.get("channel-123")
        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(SessionStore.Default))
    )

    it.effect("should not fail when deleting non-existent session", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        // Should not throw
        yield* store.delete("non-existent")
      }).pipe(Effect.provide(SessionStore.Default))
    )
  })

  describe("list", () => {
    it.effect("should return all sessions", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        yield* store.create("channel-1", "/path/1")
        yield* store.create("channel-2", "/path/2")
        yield* store.create("channel-3", "/path/3")

        const sessions = yield* store.list()
        expect(sessions.length).toBe(3)
      }).pipe(Effect.provide(SessionStore.Default))
    )

    it.effect("should return empty array when no sessions", () =>
      Effect.gen(function* () {
        const store = yield* SessionStore
        const sessions = yield* store.list()
        expect(sessions.length).toBe(0)
      }).pipe(Effect.provide(SessionStore.Default))
    )
  })
})
