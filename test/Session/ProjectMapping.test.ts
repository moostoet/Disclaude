import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { ProjectMapping } from "../../src/Session/ProjectMapping.ts"

describe("ProjectMapping", () => {
  // Test layer with mock config provider
  const TestProjectMappingLayer = ProjectMapping.Default.pipe(
    Layer.provide(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["DISCORD_BOT_TOKEN", "test-token"],
            ["DISCORD_APPLICATION_ID", "test-app-id"],
            ["PROJECTS_BASE_PATH", "/home/user/projects"]
          ])
        )
      )
    )
  )

  describe("resolveProjectPath", () => {
    it.effect("should use channel name as default project directory", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = yield* mapping.resolveProjectPath("my-cool-project", undefined)

        expect(path).toBe("/home/user/projects/my-cool-project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should sanitize channel names with special characters", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = yield* mapping.resolveProjectPath("my project!@#$%", undefined)

        // Should sanitize to safe directory name
        expect(path).toBe("/home/user/projects/my-project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should handle channel names with spaces", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = yield* mapping.resolveProjectPath("my cool project", undefined)

        expect(path).toBe("/home/user/projects/my-cool-project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should use topic path if provided and valid", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = yield* mapping.resolveProjectPath(
          "general",
          "Project: /custom/path/to/project"
        )

        expect(path).toBe("/custom/path/to/project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should fall back to channel name if topic has no valid path", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = yield* mapping.resolveProjectPath(
          "my-project",
          "Just a regular topic without a path"
        )

        expect(path).toBe("/home/user/projects/my-project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should expand ~ in topic paths", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = yield* mapping.resolveProjectPath(
          "general",
          "Project: ~/my-projects/foo"
        )

        // Should expand ~ to home directory
        expect(path).toContain("/my-projects/foo")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )
  })

  describe("extractPathFromTopic", () => {
    it.effect("should extract path with 'Project:' prefix", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = mapping.extractPathFromTopic("Project: /path/to/project")

        expect(path).toBe("/path/to/project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should extract path with 'project:' prefix (case insensitive)", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = mapping.extractPathFromTopic("project: /path/to/project")

        expect(path).toBe("/path/to/project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should extract path with 'Path:' prefix", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = mapping.extractPathFromTopic("Path: /another/path")

        expect(path).toBe("/another/path")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should return undefined for topic without path prefix", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = mapping.extractPathFromTopic("Just a regular topic")

        expect(path).toBeUndefined()
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should return undefined for undefined topic", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const path = mapping.extractPathFromTopic(undefined)

        expect(path).toBeUndefined()
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )
  })

  describe("sanitizeChannelName", () => {
    it.effect("should convert to lowercase", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const name = mapping.sanitizeChannelName("MyProject")

        expect(name).toBe("myproject")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should replace spaces with hyphens", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const name = mapping.sanitizeChannelName("my cool project")

        expect(name).toBe("my-cool-project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should remove special characters", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const name = mapping.sanitizeChannelName("project!@#$%^&*()")

        expect(name).toBe("project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should collapse multiple hyphens", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const name = mapping.sanitizeChannelName("my---project")

        expect(name).toBe("my-project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )

    it.effect("should trim leading and trailing hyphens", () =>
      Effect.gen(function* () {
        const mapping = yield* ProjectMapping
        const name = mapping.sanitizeChannelName("-my-project-")

        expect(name).toBe("my-project")
      }).pipe(Effect.provide(TestProjectMappingLayer))
    )
  })
})
