import { Discord, Ix } from "dfx"
import { InteractionsRegistry } from "dfx/gateway"
import { Effect, Layer, Option } from "effect"
import { SessionContinuity } from "../../Claude/SessionContinuity.ts"
import { ProjectRegistry } from "../../Session/ProjectRegistry.ts"

const make = Effect.gen(function* () {
  const registry = yield* InteractionsRegistry
  const continuity = yield* SessionContinuity
  const projectRegistry = yield* ProjectRegistry

  // Using guild-specific registration for instant updates (global commands take up to 1 hour)
  const command = Ix.guild(
    {
      name: "session",
      description: "Manage Claude Code sessions",
      options: [
        {
          type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
          name: "clear",
          description: "Clear the Claude session for this channel (start fresh)"
        },
        {
          type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
          name: "info",
          description: "Show current session information"
        }
      ]
    },
    (ix) =>
      ix.subCommands({
        clear: Effect.gen(function* () {
          const channelId = ix.interaction.channel_id!

          // Check if channel has a project
          const project = yield* projectRegistry.getProject(channelId)

          if (Option.isNone(project)) {
            return Ix.response({
              type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                flags: Discord.MessageFlags.Ephemeral,
                content: `No project is assigned to this channel. Nothing to clear.`
              }
            })
          }

          // Clear the session
          yield* continuity.clearSession(channelId)

          return Ix.response({
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `Claude session cleared. The next message will start a fresh conversation.`
            }
          })
        }),

        info: Effect.gen(function* () {
          const channelId = ix.interaction.channel_id!
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

          const sessionId = yield* continuity.getClaudeSessionId(channelId)

          if (Option.isNone(sessionId)) {
            return Ix.response({
              type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                flags: Discord.MessageFlags.Ephemeral,
                content: `**Project:** \`${project.value}\`\n**Session:** No active session\n\nSend a message to start a new session.`
              }
            })
          }

          return Ix.response({
            type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: Discord.MessageFlags.Ephemeral,
              content: `**Project:** \`${project.value}\`\n**Session ID:** \`${sessionId.value.slice(0, 8)}...\`\n\nUse \`/session clear\` to start fresh.`
            }
          })
        })
      })
  )

  const ix = Ix.builder.add(command).catchAllCause(Effect.logError)
  yield* registry.register(ix)
}).pipe(Effect.annotateLogs({ service: "SessionCommands" }))

export const SessionCommandsLive = Layer.scopedDiscard(make)
