import { Discord, Ix } from "dfx"
import { InteractionsRegistry } from "dfx/gateway"
import { Effect, Layer } from "effect"
import { AppConfig } from "../../Config/index.ts"

const make = Effect.gen(function* () {
  const registry = yield* InteractionsRegistry
  const config = yield* AppConfig

  // /tools command - view allowed tools configuration
  const command = Ix.guild(
    {
      name: "tools",
      description: "View Claude Code tool permissions",
      options: [
        {
          type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
          name: "list",
          description: "List allowed tools for Claude Code"
        },
        {
          type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
          name: "info",
          description: "Show information about tool permissions"
        }
      ]
    },
    (ix) =>
      ix.subCommands({
        list: Effect.gen(function* () {
          const tools = config.claudeAllowedTools

          if (tools.length === 0) {
            return Ix.response({
              type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                flags: Discord.MessageFlags.Ephemeral,
                content: `**Allowed Tools**\n\nNo tool restrictions configured. All tools are allowed.\n\nTo restrict tools, set the \`CLAUDE_ALLOWED_TOOLS\` environment variable.`
              }
            })
          }

          const toolList = tools.map((t) => `• \`${t}\``).join("\n")

          return Ix.response({
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: Discord.MessageFlags.Ephemeral,
              content: `**Allowed Tools**\n\n${toolList}\n\nOnly these tools can be used by Claude Code.`
            }
          })
        }),

        info: Effect.gen(function* () {
          const tools = config.claudeAllowedTools
          const status =
            tools.length === 0
              ? "**Status:** All tools allowed (no restrictions)"
              : `**Status:** Restricted to ${tools.length} tool(s)`

          return Ix.response({
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: Discord.MessageFlags.Ephemeral,
              content: `**Tool Permissions**\n\n${status}\n\n**Common Tools:**\n• \`Read\` - Read files\n• \`Write\` - Write files\n• \`Edit\` - Edit files\n• \`Bash\` - Run shell commands\n• \`Glob\` - Search for files\n• \`Grep\` - Search file contents\n\nTool restrictions are configured via \`CLAUDE_ALLOWED_TOOLS\` environment variable.`
            }
          })
        })
      })
  )

  const ix = Ix.builder.add(command).catchAllCause(Effect.logError)
  yield* registry.register(ix)
}).pipe(Effect.annotateLogs({ service: "ToolsCommand" }))

export const ToolsCommandLive = Layer.scopedDiscard(make)
