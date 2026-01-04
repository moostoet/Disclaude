import { Discord, DiscordREST, Ix } from "dfx"
import { InteractionsRegistry } from "dfx/gateway"
import { Effect, Layer, Option } from "effect"
import { ClaudeProcess } from "../../Claude/ClaudeProcess.ts"
import { SessionContinuity } from "../../Claude/SessionContinuity.ts"
import { ProjectRegistry } from "../../Session/ProjectRegistry.ts"
import { formatClaudeResponse } from "../ResponseFormatter.ts"

const make = Effect.gen(function* () {
  const registry = yield* InteractionsRegistry
  const rest = yield* DiscordREST
  const claude = yield* ClaudeProcess
  const continuity = yield* SessionContinuity
  const projectRegistry = yield* ProjectRegistry

  // /ask command - send a prompt to Claude
  const command = Ix.guild(
    {
      name: "ask",
      description: "Send a prompt to Claude Code",
      options: [
        {
          type: Discord.ApplicationCommandOptionType.STRING,
          name: "prompt",
          description: "The prompt to send to Claude",
          required: true
        }
      ]
    },
    Effect.fn("AskCommand.handle")(function* (ix) {
      const channelId = ix.interaction.channel_id!

      // Extract prompt from options
      const data = ix.data
      let prompt = ""
      if (data && "options" in data && data.options) {
        const promptOption = data.options.find((opt) => opt.name === "prompt")
        if (promptOption && "value" in promptOption) {
          prompt = String(promptOption.value)
        }
      }

      if (prompt.trim().length === 0) {
        return Ix.response({
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: Discord.MessageFlags.Ephemeral,
            content: "Please provide a prompt."
          }
        })
      }

      // Check if project is assigned
      const projectOption = yield* projectRegistry.getProject(channelId)

      if (Option.isNone(projectOption)) {
        return Ix.response({
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: Discord.MessageFlags.Ephemeral,
            content: `No project is assigned to this channel.\n\nUse \`/project create <name>\` or \`/project link <path>\` to set one up first.`
          }
        })
      }

      const projectPath = projectOption.value

      // Defer the response since Claude may take a while
      yield* Effect.tryPromise(() =>
        // Send deferred response
        Promise.resolve()
      )

      // Get existing session for resume
      const existingSessionId = yield* continuity.getClaudeSessionId(channelId)

      // Execute Claude
      const executeOptions = Option.isSome(existingSessionId)
        ? { prompt, workingDirectory: projectPath, sessionId: existingSessionId.value }
        : { prompt, workingDirectory: projectPath }

      const response = yield* claude.execute(executeOptions).pipe(
        Effect.tapError((err) => Effect.log(`Claude error: ${err.message}`))
      )

      // Store the new session ID
      yield* continuity.storeClaudeSessionId(channelId, projectPath, response.session_id)

      // Format and send response
      const chunks = formatClaudeResponse(response.result)

      // First chunk as the command response
      if (chunks.length > 0) {
        // Send first chunk
        yield* rest.createMessage(channelId, {
          content: chunks[0]
        })

        // Send remaining chunks as follow-ups
        for (let i = 1; i < chunks.length; i++) {
          yield* rest.createMessage(channelId, {
            content: chunks[i]
          })
        }
      }

      // Return acknowledgment (the actual response was sent via REST)
      return Ix.response({
        type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `> ${prompt.slice(0, 100)}${prompt.length > 100 ? "..." : ""}\n\n*Processing with Claude Code...*`
        }
      })
    })
  )

  const ix = Ix.builder.add(command).catchAllCause(Effect.logError)
  yield* registry.register(ix)
}).pipe(Effect.annotateLogs({ service: "AskCommand" }))

export const AskCommandLive = Layer.scopedDiscard(make)
