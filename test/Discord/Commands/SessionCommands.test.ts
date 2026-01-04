import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { SessionContinuity } from "../../../src/Claude/SessionContinuity.ts"
import { ProjectRegistry } from "../../../src/Session/ProjectRegistry.ts"

describe("SessionCommands", () => {
  const TestLayer = Layer.mergeAll(
    SessionContinuity.Default,
    ProjectRegistry.Default
  )

  describe("session clear logic", () => {
    it.effect("should clear session when project is assigned", () =>
      Effect.gen(function* () {
        const continuity = yield* SessionContinuity
        const registry = yield* ProjectRegistry
        const channelId = "clear-test-channel"
        const projectPath = "/some/project"

        // Assign a project first
        yield* registry.assignProject(channelId, projectPath)

        // Store a session (requires projectPath)
        yield* continuity.storeClaudeSessionId(channelId, projectPath, "session-to-clear")
        let sessionId = yield* continuity.getClaudeSessionId(channelId)
        expect(Option.isSome(sessionId)).toBe(true)

        // Clear the session
        yield* continuity.clearSession(channelId)
        sessionId = yield* continuity.getClaudeSessionId(channelId)
        expect(Option.isNone(sessionId)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should handle clear when no session exists", () =>
      Effect.gen(function* () {
        const continuity = yield* SessionContinuity
        const registry = yield* ProjectRegistry
        const channelId = "no-session-channel"

        // Assign a project but no session
        yield* registry.assignProject(channelId, "/some/project")

        // Clear should not throw
        yield* continuity.clearSession(channelId)

        const sessionId = yield* continuity.getClaudeSessionId(channelId)
        expect(Option.isNone(sessionId)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should return None for project when not assigned", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const channelId = "unassigned-channel"

        const project = yield* registry.getProject(channelId)
        expect(Option.isNone(project)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("session info logic", () => {
    it.effect("should return project path and session id when both exist", () =>
      Effect.gen(function* () {
        const continuity = yield* SessionContinuity
        const registry = yield* ProjectRegistry
        const channelId = "info-test-channel"
        const projectPath = "/test/project/path"
        const sessionId = "test-session-id-12345678"

        yield* registry.assignProject(channelId, projectPath)
        yield* continuity.storeClaudeSessionId(channelId, projectPath, sessionId)

        const project = yield* registry.getProject(channelId)
        const session = yield* continuity.getClaudeSessionId(channelId)

        expect(Option.isSome(project)).toBe(true)
        expect(Option.getOrNull(project)).toBe(projectPath)
        expect(Option.isSome(session)).toBe(true)
        expect(Option.getOrNull(session)).toBe(sessionId)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should return project but None session when no session started", () =>
      Effect.gen(function* () {
        const continuity = yield* SessionContinuity
        const registry = yield* ProjectRegistry
        const channelId = "project-only-channel"
        const projectPath = "/test/project"

        yield* registry.assignProject(channelId, projectPath)

        const project = yield* registry.getProject(channelId)
        const session = yield* continuity.getClaudeSessionId(channelId)

        expect(Option.isSome(project)).toBe(true)
        expect(Option.isNone(session)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should return None for both when nothing assigned", () =>
      Effect.gen(function* () {
        const continuity = yield* SessionContinuity
        const registry = yield* ProjectRegistry
        const channelId = "empty-channel"

        const project = yield* registry.getProject(channelId)
        const session = yield* continuity.getClaudeSessionId(channelId)

        expect(Option.isNone(project)).toBe(true)
        expect(Option.isNone(session)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
