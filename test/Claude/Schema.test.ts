import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import {
  ClaudeResponse,
  ClaudeUsage,
  ClaudeModelUsage,
  ClaudeError
} from "../../src/Claude/Schema.ts"

describe("ClaudeUsage", () => {
  const validUsage = {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: 1000,
    cache_read_input_tokens: 500
  }

  it.effect("should decode valid usage", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(ClaudeUsage)(validUsage)
      expect(decoded.input_tokens).toBe(100)
      expect(decoded.output_tokens).toBe(50)
    })
  )

  it.effect("should handle missing optional fields", () =>
    Effect.gen(function* () {
      const minimal = { input_tokens: 10, output_tokens: 5 }
      const decoded = yield* Schema.decodeUnknown(ClaudeUsage)(minimal)
      expect(decoded.input_tokens).toBe(10)
    })
  )
})

describe("ClaudeModelUsage", () => {
  const validModelUsage = {
    "claude-opus-4-5-20251101": {
      inputTokens: 864,
      outputTokens: 170,
      cacheReadInputTokens: 12952,
      cacheCreationInputTokens: 15182,
      costUSD: 0.1099335,
      contextWindow: 200000
    }
  }

  it.effect("should decode model usage record", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(ClaudeModelUsage)(validModelUsage)
      const opus = decoded["claude-opus-4-5-20251101"]
      expect(opus).toBeDefined()
      expect(opus?.inputTokens).toBe(864)
      expect(opus?.costUSD).toBe(0.1099335)
    })
  )
})

describe("ClaudeResponse", () => {
  const validSuccessResponse = {
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 13479,
    duration_api_ms: 15385,
    num_turns: 1,
    result: "Hello! I'm Claude.",
    session_id: "b9d2fe64-4c85-490e-ade2-e58bbe724422",
    total_cost_usd: 0.1115375,
    usage: {
      input_tokens: 2,
      output_tokens: 26
    },
    uuid: "138da3d3-d040-42cb-b877-66a66f655281"
  }

  it.effect("should decode a successful response", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(ClaudeResponse)(validSuccessResponse)

      expect(decoded.type).toBe("result")
      expect(decoded.subtype).toBe("success")
      expect(decoded.is_error).toBe(false)
      expect(decoded.result).toBe("Hello! I'm Claude.")
      expect(decoded.session_id).toBe("b9d2fe64-4c85-490e-ade2-e58bbe724422")
    })
  )

  it.effect("should decode response with full usage stats", () =>
    Effect.gen(function* () {
      const fullResponse = {
        ...validSuccessResponse,
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 15182,
          cache_read_input_tokens: 12952,
          output_tokens: 26,
          server_tool_use: {
            web_search_requests: 0,
            web_fetch_requests: 0
          }
        },
        modelUsage: {
          "claude-opus-4-5-20251101": {
            inputTokens: 864,
            outputTokens: 170,
            cacheReadInputTokens: 12952,
            cacheCreationInputTokens: 15182,
            costUSD: 0.1099335,
            contextWindow: 200000
          }
        }
      }

      const decoded = yield* Schema.decodeUnknown(ClaudeResponse)(fullResponse)
      expect(decoded.usage.input_tokens).toBe(2)
      expect(decoded.total_cost_usd).toBe(0.1115375)
    })
  )

  it.effect("should handle error responses", () =>
    Effect.gen(function* () {
      const errorResponse = {
        ...validSuccessResponse,
        subtype: "error",
        is_error: true,
        result: "An error occurred"
      }

      const decoded = yield* Schema.decodeUnknown(ClaudeResponse)(errorResponse)
      expect(decoded.is_error).toBe(true)
      expect(decoded.subtype).toBe("error")
    })
  )

  it.effect("should extract session_id for resumption", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(ClaudeResponse)(validSuccessResponse)
      expect(decoded.session_id).toMatch(/^[a-f0-9-]{36}$/)
    })
  )
})

describe("ClaudeError", () => {
  it.effect("should create error with type and message", () =>
    Effect.gen(function* () {
      const error = {
        type: "process_error",
        message: "Claude CLI exited with code 1"
      }
      const decoded = yield* Schema.decodeUnknown(ClaudeError)(error)

      expect(decoded.type).toBe("process_error")
      expect(decoded.message).toBe("Claude CLI exited with code 1")
    })
  )

  it.effect("should handle optional exitCode", () =>
    Effect.gen(function* () {
      const error = {
        type: "process_error",
        message: "Process failed",
        exitCode: 1
      }
      const decoded = yield* Schema.decodeUnknown(ClaudeError)(error)

      expect(decoded.exitCode).toBe(1)
    })
  )

  it.effect("should handle optional stderr", () =>
    Effect.gen(function* () {
      const error = {
        type: "process_error",
        message: "Process failed",
        stderr: "Error: Something went wrong"
      }
      const decoded = yield* Schema.decodeUnknown(ClaudeError)(error)

      expect(decoded.stderr).toBe("Error: Something went wrong")
    })
  )
})
