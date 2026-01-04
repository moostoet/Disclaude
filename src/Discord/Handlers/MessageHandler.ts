import { Discord, DiscordREST } from "dfx"
import { DiscordGateway } from "dfx/gateway"
import { Data, Effect, Layer, Option } from "effect"
import { DiscordApplication } from "../DiscordApplication.ts"
import { extractMentionedPrompt, formatClaudeResponse } from "../ResponseFormatter.ts"
import { ClaudeProcess } from "../../Claude/ClaudeProcess.ts"
import { SessionContinuity } from "../../Claude/SessionContinuity.ts"
import { ProjectRegistry } from "../../Session/ProjectRegistry.ts"
import { detectQuestion, getButtonsForQuestion, createButtonComponents } from "./QuestionHandler.ts"

// Message eligibility result - either eligible with extracted data, or not eligible with reason
export type MessageEligibility =
  | { readonly _tag: "Eligible"; readonly channelId: string; readonly prompt: string; readonly messageId: string }
  | { readonly _tag: "NotEligible"; readonly reason: "from_bot" | "not_mentioned" | "empty_prompt" }

/**
 * Check if a message is eligible for processing.
 * Returns extracted prompt if eligible, or reason if not.
 */
export const isEligibleMessage = (
  message: Discord.GatewayMessageCreateDispatchData,
  botId: string
): MessageEligibility => {
  // Ignore messages from bots
  if (message.author.bot) {
    return { _tag: "NotEligible", reason: "from_bot" }
  }

  // Check if bot is mentioned (mentions is part of GatewayMessageEventExtraFields)
  const mentions = (message as { mentions?: Array<{ id: string }> }).mentions
  const isMentioned = mentions?.some((user) => user.id === botId) ?? false
  if (!isMentioned) {
    return { _tag: "NotEligible", reason: "not_mentioned" }
  }

  // Extract prompt from message
  const prompt = extractMentionedPrompt(message.content, botId)
  if (prompt === null || prompt.trim() === "") {
    return { _tag: "NotEligible", reason: "empty_prompt" }
  }

  return {
    _tag: "Eligible",
    channelId: message.channel_id,
    prompt: prompt.trim(),
    messageId: message.id
  }
}

// Error for non-eligible messages (used for control flow)
class NonEligibleMessage extends Data.TaggedError("NonEligibleMessage")<{
  readonly reason: string
}> {}

// Error for message handling failures
export class MessageHandlerError extends Data.TaggedError("MessageHandlerError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Create the message handler layer.
 * Handles @mentions of the bot, executes Claude, and replies.
 */
// Error for no project assigned to channel
class NoProjectAssigned extends Data.TaggedError("NoProjectAssigned")<{
  readonly channelId: string
}> {}

const make = Effect.gen(function* () {
  const rest = yield* DiscordREST
  const gateway = yield* DiscordGateway
  const application = yield* DiscordApplication
  const claude = yield* ClaudeProcess
  const continuity = yield* SessionContinuity
  const projectRegistry = yield* ProjectRegistry

  const botId = application.id

  // Handler for MESSAGE_CREATE events
  const handleMessage = gateway.handleDispatch(
    "MESSAGE_CREATE",
    Effect.fnUntraced(
      function* (message) {
        yield* Effect.log(`MESSAGE_CREATE from ${message.author.username}: "${message.content.slice(0, 50)}"`)

        // Check eligibility
        const eligibility = isEligibleMessage(message, botId)
        if (eligibility._tag === "NotEligible") {
          yield* Effect.log(`Message not eligible: ${eligibility.reason}`)
          return yield* new NonEligibleMessage({ reason: eligibility.reason })
        }

        const { channelId, prompt, messageId } = eligibility

        yield* Effect.log(`Received prompt: "${prompt}" from channel ${channelId}`)

        // Show typing indicator while processing
        yield* rest.triggerTypingIndicator(channelId).pipe(Effect.ignore)

        // Check if a project is explicitly assigned to this channel
        const projectOption = yield* projectRegistry.getProject(channelId)

        if (Option.isNone(projectOption)) {
          // No project assigned - tell user how to set one up
          yield* rest.createMessage(channelId, {
            content: `No project is assigned to this channel.\n\nUse \`/project create <name>\` to create a new project, or \`/project link <path>\` to link an existing directory.`,
            message_reference: { message_id: messageId }
          })
          return yield* new NoProjectAssigned({ channelId })
        }

        const projectPath = projectOption.value

        yield* Effect.log(`Project path: ${projectPath}`)

        // Get existing Claude session ID for resume
        const existingSessionId = yield* continuity.getClaudeSessionId(channelId)

        // Update state to awaiting response
        yield* continuity.storeClaudeSessionId(channelId, projectPath, "").pipe(
          Effect.ignore
        )

        // Execute Claude - conditionally include sessionId if present
        const executeOptions = Option.isSome(existingSessionId)
          ? { prompt, workingDirectory: projectPath, sessionId: existingSessionId.value }
          : { prompt, workingDirectory: projectPath }

        yield* Effect.log(`Executing Claude with prompt: "${prompt}"`)

        const response = yield* claude.execute(executeOptions).pipe(
          Effect.tapError((err) =>
            Effect.log(`Claude error: ${err.message}`)
          )
        )

        yield* Effect.log(`Claude responded (${response.num_turns} turns, $${response.total_cost_usd.toFixed(4)})`)

        // Store the new session ID for future resume
        yield* continuity.storeClaudeSessionId(
          channelId,
          projectPath,
          response.session_id
        )

        // Format and send response
        const chunks = formatClaudeResponse(response.result)
        yield* Effect.log(`Sending ${chunks.length} message chunk(s) to Discord`)

        // Check if response contains a question
        const question = detectQuestion(response.result)

        // Send first chunk as reply to original message
        if (chunks.length > 0) {
          // If there's a question in the last chunk, add buttons
          if (question && chunks.length === 1) {
            const buttons = getButtonsForQuestion(question.type)
            const components = createButtonComponents(channelId, messageId, buttons)

            yield* rest.createMessage(channelId, {
              content: chunks[0],
              message_reference: { message_id: messageId },
              components
            })
          } else {
            yield* rest.createMessage(channelId, {
              content: chunks[0],
              message_reference: { message_id: messageId }
            })
          }
        }

        // Send remaining chunks as follow-up messages
        for (let i = 1; i < chunks.length; i++) {
          // Add buttons to last chunk if there's a question
          if (question && i === chunks.length - 1) {
            const buttons = getButtonsForQuestion(question.type)
            const components = createButtonComponents(channelId, messageId, buttons)

            yield* rest.createMessage(channelId, {
              content: chunks[i],
              components
            })
          } else {
            yield* rest.createMessage(channelId, {
              content: chunks[i]
            })
          }
        }
      },
      // Silently ignore non-eligible messages and no-project cases
      Effect.catchTag("NonEligibleMessage", () => Effect.void),
      Effect.catchTag("NoProjectAssigned", () => Effect.void),
      // Add span for observability
      (effect, message) =>
        Effect.withSpan(effect, "MessageHandler.handleMessage", {
          attributes: { messageId: message.id, channelId: message.channel_id }
        }),
      // Log errors but don't crash
      Effect.catchAllCause((cause) =>
        Effect.gen(function* () {
          yield* Effect.logError("Message handler error", cause)
        })
      )
    )
  )

  // Fork the handler to run in background
  yield* Effect.forkScoped(handleMessage)
})

/**
 * Message Handler Layer - processes @mentions and replies with Claude responses.
 */
export const MessageHandlerLive = Layer.scopedDiscard(make)
