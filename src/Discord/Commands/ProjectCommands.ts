import { FileSystem } from "@effect/platform"
import { Discord, DiscordREST, Ix } from "dfx"
import { InteractionsRegistry } from "dfx/gateway"
import { Effect, Layer, Option } from "effect"
import { ProjectRegistry } from "../../Session/ProjectRegistry.ts"
import { AppConfig } from "../../Config/index.ts"
import * as path from "node:path"
import * as os from "node:os"

const PROJECTS_CATEGORY_NAME = "Projects"

// Expand ~ to home directory
const expandHome = (filepath: string): string => {
  if (filepath.startsWith("~/")) {
    return path.join(os.homedir(), filepath.slice(2))
  }
  return filepath
}

// Sanitize project name for filesystem
const sanitizeName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

// Extract subcommand and options from interaction data
const parseInteraction = (data: Discord.APIApplicationCommandInteraction["data"]) => {
  // Only chat input commands have options
  if (!data || !("options" in data)) {
    return { subcommand: null, options: {} as Record<string, string> }
  }
  const subCmd = data.options?.[0]
  if (!subCmd || subCmd.type !== Discord.ApplicationCommandOptionType.SUB_COMMAND) {
    return { subcommand: null, options: {} as Record<string, string> }
  }
  const options: Record<string, string> = {}
  for (const opt of subCmd.options ?? []) {
    if ("value" in opt) {
      options[opt.name] = String(opt.value)
    }
  }
  return { subcommand: subCmd.name, options }
}

const make = Effect.gen(function* () {
  const registry = yield* InteractionsRegistry
  const rest = yield* DiscordREST
  const projectRegistry = yield* ProjectRegistry
  const config = yield* AppConfig
  const fs = yield* FileSystem.FileSystem

  // Find or create the "Projects" category in a guild
  const getOrCreateProjectsCategory = (guildId: string) =>
    Effect.gen(function* () {
      // List all channels in the guild
      const channels = yield* rest.listGuildChannels(guildId)

      // Find existing "Projects" category (type 4 = GUILD_CATEGORY)
      const existingCategory = channels.find(
        (ch) =>
          ch.type === Discord.ChannelTypes.GUILD_CATEGORY &&
          "name" in ch &&
          ch.name === PROJECTS_CATEGORY_NAME
      )

      if (existingCategory) {
        return existingCategory.id
      }

      // Create the category if it doesn't exist
      const newCategory = yield* rest.createGuildChannel(guildId, {
        name: PROJECTS_CATEGORY_NAME,
        type: Discord.ChannelTypes.GUILD_CATEGORY
      })

      return newCategory.id
    })

  // Create a new text channel under the Projects category
  const createProjectChannel = (guildId: string, channelName: string) =>
    Effect.gen(function* () {
      const categoryId = yield* getOrCreateProjectsCategory(guildId)

      // Create the text channel under the category (type 0 = GUILD_TEXT)
      const newChannel = yield* rest.createGuildChannel(guildId, {
        name: channelName,
        type: Discord.ChannelTypes.GUILD_TEXT,
        parent_id: categoryId
      })

      return newChannel
    })

  // /project command with subcommands
  // Using guild-specific registration for instant updates (global commands take up to 1 hour)
  const command = Ix.guild(
    {
      name: "project",
      description: "Manage Claude Code projects for this channel",
      options: [
        {
          type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
          name: "create",
          description: "Create a new project directory and assign it to this channel",
          options: [
            {
              type: Discord.ApplicationCommandOptionType.STRING,
              name: "name",
              description: "Project name (will be used as directory name)",
              required: true
            }
          ]
        },
        {
          type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
          name: "link",
          description: "Link an existing directory to this channel",
          options: [
            {
              type: Discord.ApplicationCommandOptionType.STRING,
              name: "path",
              description: "Absolute path to the project directory (supports ~)",
              required: true
            }
          ]
        },
        {
          type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
          name: "info",
          description: "Show the current project for this channel"
        },
        {
          type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
          name: "unlink",
          description: "Remove the project assignment from this channel"
        }
      ]
    },
    Effect.fn("ProjectCommands.handle")(function* (ix) {
      const channelId = ix.interaction.channel_id!
      const { subcommand, options } = parseInteraction(ix.data)

      if (subcommand === "create") {
        const name = options.name ?? ""
        const sanitized = sanitizeName(name)

        if (sanitized.length === 0) {
          return Ix.response({
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: Discord.MessageFlags.Ephemeral,
              content: `Invalid project name. Please use alphanumeric characters and hyphens.`
            }
          })
        }

        // Get guild ID from interaction
        const guildId = ix.interaction.guild_id
        if (!guildId) {
          return Ix.response({
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: Discord.MessageFlags.Ephemeral,
              content: `This command can only be used in a server.`
            }
          })
        }

        const basePath = expandHome(config.projectsBasePath)
        const projectPath = path.join(basePath, sanitized)

        // Create the directory
        yield* fs.makeDirectory(projectPath, { recursive: true })

        // Create a new Discord channel under "Projects" category
        const newChannel = yield* createProjectChannel(guildId, sanitized)

        // Assign the new channel to the project
        yield* projectRegistry.assignProject(newChannel.id, projectPath)

        return Ix.response({
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Project **${sanitized}** created!\n\n**Channel:** <#${newChannel.id}>\n**Directory:** \`${projectPath}\`\n\nHead to the new channel and @mention me to start working.`
          }
        })
      }

      if (subcommand === "link") {
        const rawPath = options.path ?? ""
        const projectPath = expandHome(rawPath)

        if (projectPath.length === 0) {
          return Ix.response({
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: Discord.MessageFlags.Ephemeral,
              content: `Please provide a path to the project directory.`
            }
          })
        }

        // Check if directory exists
        const exists = yield* fs.exists(projectPath)
        if (!exists) {
          return Ix.response({
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: Discord.MessageFlags.Ephemeral,
              content: `Directory not found: \`${projectPath}\`\n\nPlease provide an existing directory path.`
            }
          })
        }

        // Assign to channel
        yield* projectRegistry.assignProject(channelId, projectPath)

        return Ix.response({
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `This channel is now linked to:\n\`\`\`\n${projectPath}\n\`\`\`\nYou can now @mention me to interact with Claude Code in this project.`
          }
        })
      }

      if (subcommand === "info") {
        const project = yield* projectRegistry.getProject(channelId)

        if (Option.isNone(project)) {
          return Ix.response({
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: Discord.MessageFlags.Ephemeral,
              content: `No project is assigned to this channel.\n\nUse \`/project create <name>\` or \`/project link <path>\` to set one up.`
            }
          })
        }

        return Ix.response({
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: Discord.MessageFlags.Ephemeral,
            content: `This channel is linked to:\n\`\`\`\n${project.value}\n\`\`\``
          }
        })
      }

      if (subcommand === "unlink") {
        const project = yield* projectRegistry.getProject(channelId)

        if (Option.isNone(project)) {
          return Ix.response({
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: Discord.MessageFlags.Ephemeral,
              content: `No project is assigned to this channel.`
            }
          })
        }

        yield* projectRegistry.removeProject(channelId)

        return Ix.response({
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Project unlinked from this channel.\n\nThe directory was not deleted:\n\`\`\`\n${project.value}\n\`\`\``
          }
        })
      }

      // Unknown subcommand
      return Ix.response({
        type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: Discord.MessageFlags.Ephemeral,
          content: `Unknown subcommand.`
        }
      })
    })
  )

  const ix = Ix.builder.add(command).catchAllCause(Effect.logError)
  yield* registry.register(ix)
}).pipe(Effect.annotateLogs({ service: "ProjectCommands" }))

export const ProjectCommandsLive = Layer.scopedDiscard(make)
