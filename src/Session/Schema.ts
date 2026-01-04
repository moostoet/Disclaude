import { Schema } from "effect"

// Session state enum values
export const SessionState = {
  Idle: "idle",
  AwaitingResponse: "awaiting_response",
  AwaitingInput: "awaiting_input"
} as const

// Session state schema
export const SessionStateSchema = Schema.Literal(
  "idle",
  "awaiting_response",
  "awaiting_input"
)
export type SessionStateType = typeof SessionStateSchema.Type

// Discord session schema - maps a Discord channel/thread to a Claude Code session
export const DiscordSession = Schema.Struct({
  // Discord identifiers
  channelId: Schema.String,
  threadId: Schema.optional(Schema.String),

  // Claude Code session info
  claudeSessionId: Schema.optional(Schema.String),
  projectPath: Schema.String,

  // Session state
  state: SessionStateSchema,

  // Timestamps
  createdAt: Schema.String,
  updatedAt: Schema.String
})

export type DiscordSession = typeof DiscordSession.Type
