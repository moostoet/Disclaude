import { Discord, DiscordREST } from "dfx"
import { DiscordGateway } from "dfx/gateway"
import { Data, Effect, Layer, Option, Ref } from "effect"
import { DiscordApplication } from "../DiscordApplication.ts"
import { extractMentionedPrompt, formatClaudeResponse } from "../ResponseFormatter.ts"
import { StreamingBridge } from "../../Claude/StreamingBridge.ts"
import { SessionContinuity } from "../../Claude/SessionContinuity.ts"
import { ProjectRegistry } from "../../Session/ProjectRegistry.ts"
import { isEligibleMessage } from "./MessageHandler.ts"
import { detectQuestion, getButtonsForQuestion, createButtonComponents } from "./QuestionHandler.ts"

// Error for non-eligible messages (used for control flow)
class NonEligibleMessage extends Data.TaggedError("NonEligibleMessage")<{
  readonly reason: string
}> {}

// Error for no project assigned
class NoProjectAssigned extends Data.TaggedError("NoProjectAssigned")<{
  readonly channelId: string
}> {}

// Error for streaming handler failures
export class StreamingHandlerError extends Data.TaggedError("StreamingHandlerError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// Minimum content change to trigger an update (characters)
const MIN_CONTENT_CHANGE = 50

// Maximum updates per message to avoid hitting rate limits
const MAX_UPDATES = 20

const make = Effect.gen(function* () {
  const rest = yield* DiscordREST
  const gateway = yield* DiscordGateway
  const application = yield* DiscordApplication
  const streaming = yield* StreamingBridge
  const continuity = yield* SessionContinuity
  const projectRegistry = yield* ProjectRegistry

  const botId = application.id

  // Handler for MESSAGE_CREATE events with streaming support
  const handleMessage = gateway.handleDispatch(
    "MESSAGE_CREATE",
    Effect.fnUntraced(
      function* (message) {
        yield* Effect.log(`[Streaming] MESSAGE_CREATE from ${message.author.username}`)

        // Check eligibility
        const eligibility = isEligibleMessage(message, botId)
        if (eligibility._tag === "NotEligible") {
          return yield* new NonEligibleMessage({ reason: eligibility.reason })
        }

        const { channelId, prompt, messageId } = eligibility

        yield* Effect.log(`[Streaming] Received prompt: "${prompt}"`)

        // Show typing indicator while processing
        yield* rest.triggerTypingIndicator(channelId).pipe(Effect.ignore)

        // Check if a project is assigned
        const projectOption = yield* projectRegistry.getProject(channelId)

        if (Option.isNone(projectOption)) {
          yield* rest.createMessage(channelId, {
            content: `No project is assigned to this channel.\n\nUse \`/project create <name>\` to create a new project, or \`/project link <path>\` to link an existing directory.`,
            message_reference: { message_id: messageId }
          })
          return yield* new NoProjectAssigned({ channelId })
        }

        const projectPath = projectOption.value

        // Get existing Claude session ID for resume
        const existingSessionId = yield* continuity.getClaudeSessionId(channelId)

        // Send initial "processing" message
        const initialResponse = yield* rest.createMessage(channelId, {
          content: "Processing...",
          message_reference: { message_id: messageId }
        })

        const botMessageId = initialResponse.id

        // Track last content length for update throttling
        const lastContentLengthRef = yield* Ref.make(0)
        const updateCountRef = yield* Ref.make(0)

        // Execute with streaming, updating the message periodically
        const executeOptions = Option.isSome(existingSessionId)
          ? { prompt, workingDirectory: projectPath, sessionId: existingSessionId.value }
          : { prompt, workingDirectory: projectPath }

        const result = yield* streaming.executeStreaming(
          executeOptions,
          (content) =>
            Effect.gen(function* () {
              const lastLength = yield* Ref.get(lastContentLengthRef)
              const updateCount = yield* Ref.get(updateCountRef)

              // Only update if content changed significantly and under rate limit
              if (content.length - lastLength >= MIN_CONTENT_CHANGE && updateCount < MAX_UPDATES) {
                yield* Ref.set(lastContentLengthRef, content.length)
                yield* Ref.update(updateCountRef, (n) => n + 1)

                // Format and truncate for Discord
                const chunks = formatClaudeResponse(content)
                const displayContent = chunks[0]?.slice(0, 1990) + "..." || "Processing..."

                yield* rest.updateMessage(channelId, botMessageId, {
                  content: displayContent
                }).pipe(Effect.ignore)

                // Refresh typing indicator
                yield* rest.triggerTypingIndicator(channelId).pipe(Effect.ignore)
              }
            })
        ).pipe(
          Effect.tapError((err) =>
            Effect.log(`[Streaming] Error: ${err.message}`)
          )
        )

        // Store the session ID
        if (result.sessionId) {
          yield* continuity.storeClaudeSessionId(channelId, projectPath, result.sessionId)
        }

        // Format final response
        const chunks = formatClaudeResponse(result.content)
        yield* Effect.log(`[Streaming] Complete: ${chunks.length} chunk(s)`)

        // Check if response contains a question
        const question = detectQuestion(result.content)

        // Get first chunk content, with fallback for empty responses
        const firstChunk = chunks[0]?.trim() || "Claude completed processing."

        // Update the message with final content
        if (question && chunks.length <= 1) {
          const buttons = getButtonsForQuestion(question.type)
          const components = createButtonComponents(channelId, messageId, buttons)

          yield* rest.updateMessage(channelId, botMessageId, {
            content: firstChunk,
            components
          })
        } else {
          yield* rest.updateMessage(channelId, botMessageId, {
            content: firstChunk
          })
        }

        // Send remaining chunks as follow-up messages
        for (let i = 1; i < chunks.length; i++) {
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
      // Silently ignore non-eligible messages
      Effect.catchTag("NonEligibleMessage", () => Effect.void),
      Effect.catchTag("NoProjectAssigned", () => Effect.void),
      // Add span for observability
      (effect, message) =>
        Effect.withSpan(effect, "StreamingMessageHandler.handleMessage", {
          attributes: { messageId: message.id, channelId: message.channel_id }
        }),
      // Log errors but don't crash
      Effect.catchAllCause((cause) =>
        Effect.gen(function* () {
          yield* Effect.logError("Streaming message handler error", cause)
        })
      )
    )
  )

  // Fork the handler to run in background
  yield* Effect.forkScoped(handleMessage)
})

/**
 * Streaming Message Handler Layer - processes @mentions with streaming Claude responses.
 * Use this instead of MessageHandlerLive for real-time streaming output.
 */
export const StreamingMessageHandlerLive = Layer.scopedDiscard(make)
