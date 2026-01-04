import { Discord, DiscordREST, Ix } from "dfx"
import { InteractionsRegistry } from "dfx/gateway"
import { Effect, Layer, Option } from "effect"
import { ClaudeProcess } from "../../Claude/ClaudeProcess.ts"
import { SessionContinuity } from "../../Claude/SessionContinuity.ts"
import { ProjectRegistry } from "../../Session/ProjectRegistry.ts"
import { formatClaudeResponse } from "../ResponseFormatter.ts"

// Question detection patterns
const QUESTION_PATTERNS = {
  // Matches: "? (yes/no)", "? [y/n]", "? yes/no", etc.
  yesNo: /\?\s*[\[(]?\s*(yes\s*[/|]\s*no|y\s*[/|]\s*n)\s*[\])]?\s*$/i,
  proceed: /\b(proceed|continue)\b.*\?/i,
  confirm: /\b(confirm|approve|deny)\b/i,
  choice: /\b(option|choose|select)\b.*:/i,
  planMode: /\bplan\s*mode\b/i
}

export type QuestionType = "yesNo" | "proceed" | "confirm" | "choice" | "planMode"

export interface DetectedQuestion {
  readonly type: QuestionType
  readonly hasQuestion: boolean
}

// Detect if text ends with a question
export const detectQuestion = (text: string): DetectedQuestion | null => {
  const trimmed = text.trim()
  const lastLine = trimmed.split("\n").pop() ?? ""

  // Check yesNo first - most specific pattern for explicit (yes/no) suffix
  if (QUESTION_PATTERNS.yesNo.test(lastLine)) {
    return { type: "yesNo", hasQuestion: true }
  }
  // Then check for plan mode anywhere in text
  if (QUESTION_PATTERNS.planMode.test(trimmed)) {
    return { type: "planMode", hasQuestion: true }
  }
  // Proceed questions
  if (QUESTION_PATTERNS.proceed.test(lastLine)) {
    return { type: "proceed", hasQuestion: true }
  }
  if (QUESTION_PATTERNS.confirm.test(lastLine)) {
    return { type: "confirm", hasQuestion: true }
  }
  if (QUESTION_PATTERNS.choice.test(lastLine)) {
    return { type: "choice", hasQuestion: true }
  }

  return null
}

// Button configuration for each question type
export interface QuestionButton {
  readonly label: string
  readonly value: string
  readonly style: Discord.ButtonStyleTypes
}

export const getButtonsForQuestion = (type: QuestionType): ReadonlyArray<QuestionButton> => {
  switch (type) {
    case "yesNo":
      return [
        { label: "Yes", value: "yes", style: Discord.ButtonStyleTypes.PRIMARY },
        { label: "No", value: "no", style: Discord.ButtonStyleTypes.SECONDARY }
      ]
    case "proceed":
      return [
        { label: "Continue", value: "continue", style: Discord.ButtonStyleTypes.PRIMARY },
        { label: "Cancel", value: "cancel", style: Discord.ButtonStyleTypes.DANGER }
      ]
    case "confirm":
      return [
        { label: "Approve", value: "approve", style: Discord.ButtonStyleTypes.SUCCESS },
        { label: "Deny", value: "deny", style: Discord.ButtonStyleTypes.DANGER }
      ]
    case "planMode":
      return [
        { label: "Approve Plan", value: "yes, proceed with this plan", style: Discord.ButtonStyleTypes.SUCCESS },
        { label: "Modify", value: "let me suggest changes", style: Discord.ButtonStyleTypes.PRIMARY },
        { label: "Cancel", value: "cancel", style: Discord.ButtonStyleTypes.DANGER }
      ]
    case "choice":
      return [
        { label: "Option 1", value: "1", style: Discord.ButtonStyleTypes.PRIMARY },
        { label: "Option 2", value: "2", style: Discord.ButtonStyleTypes.PRIMARY },
        { label: "Cancel", value: "cancel", style: Discord.ButtonStyleTypes.DANGER }
      ]
  }
}

// Create Discord button components
export const createButtonComponents = (
  channelId: string,
  _messageId: string,
  buttons: ReadonlyArray<QuestionButton>
) => {
  const ACTION_ROW = Discord.MessageComponentTypes.ACTION_ROW
  const BUTTON = Discord.MessageComponentTypes.BUTTON
  return [
    {
      type: ACTION_ROW,
      components: buttons.map((btn, idx) => ({
        type: BUTTON,
        style: btn.style,
        label: btn.label,
        custom_id: `claude_answer_${channelId}_${idx}_${encodeURIComponent(btn.value)}`
      }))
    }
  ]
}

// Parse button custom_id back to components
export const parseButtonId = (
  customId: string
): { channelId: string; index: number; value: string } | null => {
  if (!customId.startsWith("claude_answer_")) {
    return null
  }
  const parts = customId.slice("claude_answer_".length).split("_")
  const channelId = parts[0]
  const indexStr = parts[1]
  if (parts.length < 3 || !channelId || !indexStr) {
    return null
  }
  return {
    channelId,
    index: parseInt(indexStr, 10),
    value: decodeURIComponent(parts.slice(2).join("_"))
  }
}

const make = Effect.gen(function* () {
  const registry = yield* InteractionsRegistry
  const rest = yield* DiscordREST
  const claude = yield* ClaudeProcess
  const continuity = yield* SessionContinuity
  const projectRegistry = yield* ProjectRegistry

  // Handle button clicks for Claude answers
  const buttonHandler = Ix.messageComponent(
    Ix.idStartsWith("claude_answer_"),
    Effect.gen(function* () {
      const componentData = yield* Ix.MessageComponentData

      const customId = componentData.custom_id
      const parsed = parseButtonId(customId)

      if (!parsed) {
        return Ix.response({
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: Discord.MessageFlags.Ephemeral,
            content: "Invalid button interaction."
          }
        })
      }

      const { channelId, value } = parsed

      // Check if project is still assigned
      const projectOption = yield* projectRegistry.getProject(channelId)
      if (Option.isNone(projectOption)) {
        return Ix.response({
          type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: Discord.MessageFlags.Ephemeral,
            content: "No project is assigned to this channel."
          }
        })
      }

      const projectPath = projectOption.value

      // Acknowledge the button click immediately
      yield* Effect.logInfo(`Button clicked: ${value} for channel ${channelId}`)

      // Get existing session
      const existingSessionId = yield* continuity.getClaudeSessionId(channelId)

      // Send the answer to Claude
      const executeOptions = Option.isSome(existingSessionId)
        ? { prompt: value, workingDirectory: projectPath, sessionId: existingSessionId.value }
        : { prompt: value, workingDirectory: projectPath }

      const response = yield* claude.execute(executeOptions).pipe(
        Effect.tapError((err) => Effect.log(`Claude error: ${err.message}`))
      )

      // Store the new session ID
      yield* continuity.storeClaudeSessionId(channelId, projectPath, response.session_id)

      // Format response
      const chunks = formatClaudeResponse(response.result)
      const content = chunks[0] ?? "Claude processed your response."

      // Check for follow-up questions
      const followUpQuestion = detectQuestion(response.result)

      if (followUpQuestion) {
        const buttons = getButtonsForQuestion(followUpQuestion.type)

        return Ix.response({
          type: Discord.InteractionCallbackTypes.UPDATE_MESSAGE,
          data: {
            content: content.slice(0, 2000),
            components: createButtonComponents(channelId, "followup", buttons)
          }
        })
      }

      // No follow-up question, just update the message
      return Ix.response({
        type: Discord.InteractionCallbackTypes.UPDATE_MESSAGE,
        data: {
          content: content.slice(0, 2000),
          components: [] // Remove buttons
        }
      })
    })
  )

  const ix = Ix.builder.add(buttonHandler).catchAllCause(Effect.logError)
  yield* registry.register(ix)
}).pipe(Effect.annotateLogs({ service: "QuestionHandler" }))

export const QuestionHandlerLive = Layer.scopedDiscard(make)
