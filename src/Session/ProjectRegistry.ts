import { Effect, Option, Ref } from "effect"

// Project assignment entry
export interface ProjectAssignment {
  readonly channelId: string
  readonly projectPath: string
}

// Project Registry service interface
export interface ProjectRegistryShape {
  readonly assignProject: (
    channelId: string,
    projectPath: string
  ) => Effect.Effect<void>
  readonly getProject: (
    channelId: string
  ) => Effect.Effect<Option.Option<string>>
  readonly removeProject: (channelId: string) => Effect.Effect<void>
  readonly listProjects: () => Effect.Effect<ReadonlyArray<ProjectAssignment>>
}

/**
 * Project Registry - manages explicit channel-to-project mappings.
 * Only channels with assigned projects can use the Claude bot.
 */
export class ProjectRegistry extends Effect.Service<ProjectRegistry>()(
  "Disclaude/ProjectRegistry",
  {
    effect: Effect.gen(function* () {
      // In-memory store of channel -> project path mappings
      const mappings = yield* Ref.make<Map<string, string>>(new Map())

      const assignProject = (
        channelId: string,
        projectPath: string
      ): Effect.Effect<void> =>
        Ref.update(mappings, (map) => {
          const newMap = new Map(map)
          newMap.set(channelId, projectPath)
          return newMap
        })

      const getProject = (
        channelId: string
      ): Effect.Effect<Option.Option<string>> =>
        Ref.get(mappings).pipe(
          Effect.map((map) => Option.fromNullable(map.get(channelId)))
        )

      const removeProject = (channelId: string): Effect.Effect<void> =>
        Ref.update(mappings, (map) => {
          const newMap = new Map(map)
          newMap.delete(channelId)
          return newMap
        })

      const listProjects = (): Effect.Effect<ReadonlyArray<ProjectAssignment>> =>
        Ref.get(mappings).pipe(
          Effect.map((map) =>
            Array.from(map.entries()).map(([channelId, projectPath]) => ({
              channelId,
              projectPath
            }))
          )
        )

      return {
        assignProject,
        getProject,
        removeProject,
        listProjects
      } satisfies ProjectRegistryShape
    })
  }
) {}
