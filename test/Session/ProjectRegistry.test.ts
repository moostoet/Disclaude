import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { ProjectRegistry } from "../../src/Session/ProjectRegistry.ts"

describe("ProjectRegistry", () => {
  const TestLayer = ProjectRegistry.Default

  describe("assignProject", () => {
    it.effect("should assign a project to a channel", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry

        yield* registry.assignProject("channel-1", "/path/to/project")
        const result = yield* registry.getProject("channel-1")

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value).toBe("/path/to/project")
        }
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should overwrite existing project assignment", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry

        yield* registry.assignProject("channel-1", "/old/path")
        yield* registry.assignProject("channel-1", "/new/path")
        const result = yield* registry.getProject("channel-1")

        expect(Option.isSome(result)).toBe(true)
        if (Option.isSome(result)) {
          expect(result.value).toBe("/new/path")
        }
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should handle multiple channels independently", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry

        yield* registry.assignProject("channel-1", "/project-a")
        yield* registry.assignProject("channel-2", "/project-b")

        const result1 = yield* registry.getProject("channel-1")
        const result2 = yield* registry.getProject("channel-2")

        expect(Option.getOrNull(result1)).toBe("/project-a")
        expect(Option.getOrNull(result2)).toBe("/project-b")
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("getProject", () => {
    it.effect("should return None for unassigned channel", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry

        const result = yield* registry.getProject("unknown-channel")

        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("removeProject", () => {
    it.effect("should remove project assignment", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry

        yield* registry.assignProject("channel-1", "/path/to/project")
        yield* registry.removeProject("channel-1")
        const result = yield* registry.getProject("channel-1")

        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should not affect other channels", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry

        yield* registry.assignProject("channel-1", "/project-a")
        yield* registry.assignProject("channel-2", "/project-b")
        yield* registry.removeProject("channel-1")

        const result1 = yield* registry.getProject("channel-1")
        const result2 = yield* registry.getProject("channel-2")

        expect(Option.isNone(result1)).toBe(true)
        expect(Option.isSome(result2)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should be idempotent for non-existent channel", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry

        // Should not throw
        yield* registry.removeProject("unknown-channel")

        const result = yield* registry.getProject("unknown-channel")
        expect(Option.isNone(result)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("listProjects", () => {
    it.effect("should return empty array when no projects assigned", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry

        const result = yield* registry.listProjects()

        expect(result).toEqual([])
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should list all assigned projects", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry

        yield* registry.assignProject("channel-1", "/project-a")
        yield* registry.assignProject("channel-2", "/project-b")

        const result = yield* registry.listProjects()

        expect(result).toHaveLength(2)
        expect(result).toContainEqual({ channelId: "channel-1", projectPath: "/project-a" })
        expect(result).toContainEqual({ channelId: "channel-2", projectPath: "/project-b" })
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
