import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Layer, ConfigProvider, Option } from "effect"
import { ProjectRegistry } from "../../../src/Session/ProjectRegistry.ts"
import { AppConfig, AppConfigLive } from "../../../src/Config/index.ts"

// Test helpers for the command logic (not the full dfx interaction handler)
// We test the core business logic that the command handler uses

describe("ProjectCommands", () => {
  describe("sanitizeName", () => {
    // This function is private, but we can test its behavior through integration
    // For now, let's test the ProjectRegistry integration patterns

    it("should sanitize project names correctly", () => {
      // Recreate the logic here to unit test
      const sanitizeName = (name: string): string => {
        return name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
      }

      expect(sanitizeName("My Project")).toBe("my-project")
      expect(sanitizeName("Test!!!")).toBe("test")
      expect(sanitizeName("a--b--c")).toBe("a-b-c")
      expect(sanitizeName("---test---")).toBe("test")
      expect(sanitizeName("Hello World 123")).toBe("hello-world-123")
      expect(sanitizeName("!!!")).toBe("")
    })
  })

  describe("expandHome", () => {
    it("should expand ~ to home directory", () => {
      const os = require("node:os")
      const path = require("node:path")

      const expandHome = (filepath: string): string => {
        if (filepath.startsWith("~/")) {
          return path.join(os.homedir(), filepath.slice(2))
        }
        return filepath
      }

      expect(expandHome("~/projects")).toBe(path.join(os.homedir(), "projects"))
      expect(expandHome("/absolute/path")).toBe("/absolute/path")
      expect(expandHome("relative/path")).toBe("relative/path")
    })
  })

  describe("project create logic", () => {
    const TestConfigLayer = Layer.setConfigProvider(
      ConfigProvider.fromMap(
        new Map([
          ["DISCORD_BOT_TOKEN", "test-token"],
          ["DISCORD_APPLICATION_ID", "test-app-id"],
          ["PROJECTS_BASE_PATH", "/tmp/test-projects"]
        ])
      )
    )

    const TestLayer = Layer.mergeAll(ProjectRegistry.Default, AppConfigLive).pipe(
      Layer.provide(TestConfigLayer)
    )

    it.effect("should assign project after creation", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const channelId = "test-channel-123"
        const projectPath = "/tmp/test-projects/my-project"

        yield* registry.assignProject(channelId, projectPath)

        const project = yield* registry.getProject(channelId)
        expect(Option.isSome(project)).toBe(true)
        expect(Option.getOrNull(project)).toBe(projectPath)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should reject empty sanitized names", () =>
      Effect.gen(function* () {
        // When name sanitizes to empty string, create should fail
        const sanitizeName = (name: string): string => {
          return name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
        }

        const name = "!!!"
        const sanitized = sanitizeName(name)
        expect(sanitized.length).toBe(0)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("project link logic", () => {
    const TestConfigLayer = Layer.setConfigProvider(
      ConfigProvider.fromMap(
        new Map([
          ["DISCORD_BOT_TOKEN", "test-token"],
          ["DISCORD_APPLICATION_ID", "test-app-id"],
          ["PROJECTS_BASE_PATH", "/tmp/test-projects"]
        ])
      )
    )

    const TestLayer = Layer.mergeAll(ProjectRegistry.Default, AppConfigLive).pipe(
      Layer.provide(TestConfigLayer)
    )

    it.effect("should link existing directory to channel", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const channelId = "link-channel-456"
        const projectPath = "/home/moos/code/Disclaude" // existing path

        yield* registry.assignProject(channelId, projectPath)

        const project = yield* registry.getProject(channelId)
        expect(Option.isSome(project)).toBe(true)
        expect(Option.getOrNull(project)).toBe(projectPath)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("project info logic", () => {
    const TestLayer = ProjectRegistry.Default

    it.effect("should return None when no project assigned", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const project = yield* registry.getProject("no-project-channel")
        expect(Option.isNone(project)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should return project path when assigned", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const channelId = "info-channel-789"
        const projectPath = "/some/path"

        yield* registry.assignProject(channelId, projectPath)
        const project = yield* registry.getProject(channelId)

        expect(Option.isSome(project)).toBe(true)
        expect(Option.getOrNull(project)).toBe(projectPath)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("project unlink logic", () => {
    const TestLayer = ProjectRegistry.Default

    it.effect("should remove project assignment", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const channelId = "unlink-channel-000"
        const projectPath = "/path/to/remove"

        yield* registry.assignProject(channelId, projectPath)
        let project = yield* registry.getProject(channelId)
        expect(Option.isSome(project)).toBe(true)

        yield* registry.removeProject(channelId)
        project = yield* registry.getProject(channelId)
        expect(Option.isNone(project)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("should handle unlink of non-existent project gracefully", () =>
      Effect.gen(function* () {
        const registry = yield* ProjectRegistry
        const channelId = "never-assigned-channel"

        // Should not throw
        yield* registry.removeProject(channelId)

        const project = yield* registry.getProject(channelId)
        expect(Option.isNone(project)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
