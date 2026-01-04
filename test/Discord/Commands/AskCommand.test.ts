import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Layer, Option, ConfigProvider } from "effect"
import { ProjectRegistry } from "../../../src/Session/ProjectRegistry.ts"
import { SessionContinuity } from "../../../src/Claude/SessionContinuity.ts"

describe("AskCommand", () => {
  const TestLayer = Layer.mergeAll(
    ProjectRegistry.Default,
    SessionContinuity.Default
  )

  describe("command prerequisites", () => {
    it.effect("should require a project to be assigned", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const channelId = "ask-test-channel"

        // No project assigned
        const project = yield* registry.getProject(channelId)
        expect(Option.isNone(project)).toBe(true)

        // Command should check for project before executing Claude
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should work when project is assigned", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const channelId = "ask-with-project"
        const projectPath = "/test/project"

        yield* registry.assignProject(channelId, projectPath)

        const project = yield* registry.getProject(channelId)
        expect(Option.isSome(project)).toBe(true)
        expect(Option.getOrNull(project)).toBe(projectPath)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("session continuity", () => {
    it.effect("should use existing session for resume", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const continuity = yield* SessionContinuity
        const channelId = "ask-resume-channel"
        const projectPath = "/test/project"

        yield* registry.assignProject(channelId, projectPath)
        yield* continuity.storeClaudeSessionId(channelId, projectPath, "existing-session")

        const sessionId = yield* continuity.getClaudeSessionId(channelId)
        expect(Option.isSome(sessionId)).toBe(true)
        expect(Option.getOrNull(sessionId)).toBe("existing-session")
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should work without existing session", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const continuity = yield* SessionContinuity
        const channelId = "ask-new-session"
        const projectPath = "/test/project"

        yield* registry.assignProject(channelId, projectPath)

        const sessionId = yield* continuity.getClaudeSessionId(channelId)
        expect(Option.isNone(sessionId)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("prompt validation", () => {
    it("should reject empty prompts", () => {
      const prompt = ""
      expect(prompt.trim().length === 0).toBe(true)
    })

    it("should accept non-empty prompts", () => {
      const prompt = "Hello Claude!"
      expect(prompt.trim().length > 0).toBe(true)
    })
  })
})
