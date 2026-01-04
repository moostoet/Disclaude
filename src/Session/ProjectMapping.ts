import { Effect } from "effect"
import { AppConfig, AppConfigLive } from "../Config/index.ts"
import * as os from "node:os"
import * as path from "node:path"

// Project mapping interface
export interface ProjectMappingShape {
  readonly resolveProjectPath: (
    channelName: string,
    channelTopic: string | undefined
  ) => Effect.Effect<string>
  readonly extractPathFromTopic: (topic: string | undefined) => string | undefined
  readonly sanitizeChannelName: (name: string) => string
}

// Project mapping service - maps Discord channels to project directories
export class ProjectMapping extends Effect.Service<ProjectMapping>()("Disclaude/ProjectMapping", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig

    // Sanitize channel name to valid directory name
    const sanitizeChannelName = (name: string): string => {
      return name
        .toLowerCase()
        .replace(/\s+/g, "-") // spaces to hyphens
        .replace(/[^a-z0-9-]/g, "") // remove special chars
        .replace(/-+/g, "-") // collapse multiple hyphens
        .replace(/^-|-$/g, "") // trim leading/trailing hyphens
    }

    // Extract path from channel topic if present
    // Supports formats: "Project: /path" or "Path: /path"
    const extractPathFromTopic = (topic: string | undefined): string | undefined => {
      if (!topic) return undefined

      const patterns = [
        /project:\s*(.+)/i,
        /path:\s*(.+)/i
      ]

      for (const pattern of patterns) {
        const match = topic.match(pattern)
        if (match && match[1]) {
          return match[1].trim()
        }
      }

      return undefined
    }

    // Expand ~ to home directory
    const expandHome = (filepath: string): string => {
      if (filepath.startsWith("~/")) {
        return path.join(os.homedir(), filepath.slice(2))
      }
      return filepath
    }

    // Expand base path (handles ~)
    const getBasePath = (): string => {
      return expandHome(config.projectsBasePath)
    }

    // Resolve project path from channel info
    const resolveProjectPath = (
      channelName: string,
      channelTopic: string | undefined
    ): Effect.Effect<string> =>
      Effect.sync(() => {
        // First try to extract from topic
        const topicPath = extractPathFromTopic(channelTopic)
        if (topicPath) {
          return expandHome(topicPath)
        }

        // Fall back to channel name
        const sanitized = sanitizeChannelName(channelName)
        return path.join(getBasePath(), sanitized)
      })

    return {
      resolveProjectPath,
      extractPathFromTopic,
      sanitizeChannelName
    } satisfies ProjectMappingShape
  }),
  dependencies: [AppConfigLive]
}) {}
