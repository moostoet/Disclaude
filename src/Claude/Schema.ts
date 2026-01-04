import { Schema } from "effect"

// Server tool usage stats
export const ClaudeServerToolUse = Schema.Struct({
  web_search_requests: Schema.optional(Schema.Number),
  web_fetch_requests: Schema.optional(Schema.Number)
})

// Token usage statistics
export const ClaudeUsage = Schema.Struct({
  input_tokens: Schema.Number,
  output_tokens: Schema.Number,
  cache_creation_input_tokens: Schema.optional(Schema.Number),
  cache_read_input_tokens: Schema.optional(Schema.Number),
  server_tool_use: Schema.optional(ClaudeServerToolUse),
  service_tier: Schema.optional(Schema.String)
})
export type ClaudeUsage = typeof ClaudeUsage.Type

// Per-model usage statistics
export const ClaudeModelUsageEntry = Schema.Struct({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cacheReadInputTokens: Schema.optional(Schema.Number),
  cacheCreationInputTokens: Schema.optional(Schema.Number),
  webSearchRequests: Schema.optional(Schema.Number),
  costUSD: Schema.Number,
  contextWindow: Schema.Number
})
export type ClaudeModelUsageEntry = typeof ClaudeModelUsageEntry.Type

// Record of model usage keyed by model name
export const ClaudeModelUsage = Schema.Record({
  key: Schema.String,
  value: ClaudeModelUsageEntry
})
export type ClaudeModelUsage = typeof ClaudeModelUsage.Type

// Main Claude CLI response (--output-format json)
export const ClaudeResponse = Schema.Struct({
  type: Schema.Literal("result"),
  subtype: Schema.String, // "success", "error", etc.
  is_error: Schema.Boolean,
  duration_ms: Schema.Number,
  duration_api_ms: Schema.optional(Schema.Number),
  num_turns: Schema.Number,
  result: Schema.String,
  session_id: Schema.String,
  total_cost_usd: Schema.Number,
  usage: ClaudeUsage,
  modelUsage: Schema.optional(ClaudeModelUsage),
  permission_denials: Schema.optional(Schema.Array(Schema.Unknown)),
  uuid: Schema.String
})
export type ClaudeResponse = typeof ClaudeResponse.Type

// Error schema for process failures
export const ClaudeError = Schema.Struct({
  type: Schema.String, // "process_error", "parse_error", "timeout", etc.
  message: Schema.String,
  exitCode: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String)
})
export type ClaudeError = typeof ClaudeError.Type

// Stream event types for --output-format stream-json
export const ClaudeStreamEventType = Schema.Literal(
  "assistant",
  "user",
  "system",
  "result"
)

export const ClaudeStreamEvent = Schema.Struct({
  type: ClaudeStreamEventType,
  message: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
  // For result type
  subtype: Schema.optional(Schema.String),
  session_id: Schema.optional(Schema.String),
  result: Schema.optional(Schema.String)
})
export type ClaudeStreamEvent = typeof ClaudeStreamEvent.Type
