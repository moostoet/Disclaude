import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect } from "effect"

// Simplified stream event - matches the actual implementation
interface ParsedStreamEvent {
  readonly type: "assistant" | "system" | "result" | "user" | "unknown"
  readonly text: string | null
  readonly sessionId: string | null
}

// Extract text from assistant message content array
const extractAssistantText = (message: unknown): string | null => {
  if (!message || typeof message !== "object") return null
  const msg = message as Record<string, unknown>
  const content = msg.content
  if (!Array.isArray(content)) return null

  const texts: string[] = []
  for (const block of content) {
    if (block && typeof block === "object" && "type" in block && "text" in block) {
      if (block.type === "text" && typeof block.text === "string") {
        texts.push(block.text)
      }
    }
  }
  return texts.length > 0 ? texts.join("") : null
}

// Parse a single NDJSON line into a parsed stream event
const parseStreamLine = (line: string): ParsedStreamEvent | null => {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const type = parsed.type

    if (type === "assistant") {
      const text = extractAssistantText(parsed.message)
      return { type: "assistant", text, sessionId: null }
    }

    if (type === "result") {
      const result = typeof parsed.result === "string" ? parsed.result : null
      const sessionId = typeof parsed.session_id === "string" ? parsed.session_id : null
      return { type: "result", text: result, sessionId }
    }

    if (type === "system" || type === "user") {
      return { type, text: null, sessionId: null }
    }

    return { type: "unknown", text: null, sessionId: null }
  } catch {
    return null
  }
}

// Buffer that accumulates assistant content
interface StreamBuffer {
  content: string
  sessionId: string | null
  isComplete: boolean
  lastEvent: ParsedStreamEvent | null
}

const createStreamBuffer = (): StreamBuffer => ({
  content: "",
  sessionId: null,
  isComplete: false,
  lastEvent: null
})

const updateBuffer = (buffer: StreamBuffer, event: ParsedStreamEvent): StreamBuffer => {
  const newBuffer = { ...buffer, lastEvent: event }

  switch (event.type) {
    case "assistant":
      if (event.text) {
        newBuffer.content += event.text
      }
      break
    case "result":
      newBuffer.isComplete = true
      if (event.sessionId) {
        newBuffer.sessionId = event.sessionId
      }
      break
    case "system":
    case "user":
      // These don't add content to the buffer
      break
  }

  return newBuffer
}

describe("StreamingBridge", () => {
  describe("parseStreamLine", () => {
    it("should parse assistant event with nested message content", () => {
      // Real Claude format: message.content[].text
      const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}'
      const result = parseStreamLine(line)

      expect(result).not.toBeNull()
      expect(result?.type).toBe("assistant")
      expect(result?.text).toBe("Hello")
    })

    it("should parse result event", () => {
      const line = '{"type":"result","subtype":"success","session_id":"sess-123","result":"Done"}'
      const result = parseStreamLine(line)

      expect(result).not.toBeNull()
      expect(result?.type).toBe("result")
      expect(result?.sessionId).toBe("sess-123")
      expect(result?.text).toBe("Done")
    })

    it("should parse system event", () => {
      const line = '{"type":"system","subtype":"init"}'
      const result = parseStreamLine(line)

      expect(result).not.toBeNull()
      expect(result?.type).toBe("system")
    })

    it("should return null for empty lines", () => {
      expect(parseStreamLine("")).toBeNull()
      expect(parseStreamLine("   ")).toBeNull()
    })

    it("should return null for invalid JSON", () => {
      expect(parseStreamLine("not json")).toBeNull()
      expect(parseStreamLine("{invalid}")).toBeNull()
    })

    it("should return unknown for unrecognized type", () => {
      const result = parseStreamLine('{"type":"other"}')
      expect(result?.type).toBe("unknown")
    })
  })

  describe("StreamBuffer", () => {
    it("should create empty buffer", () => {
      const buffer = createStreamBuffer()

      expect(buffer.content).toBe("")
      expect(buffer.sessionId).toBeNull()
      expect(buffer.isComplete).toBe(false)
    })

    it("should accumulate assistant messages", () => {
      let buffer = createStreamBuffer()

      buffer = updateBuffer(buffer, { type: "assistant", text: "Hello ", sessionId: null })
      expect(buffer.content).toBe("Hello ")

      buffer = updateBuffer(buffer, { type: "assistant", text: "world!", sessionId: null })
      expect(buffer.content).toBe("Hello world!")
    })

    it("should mark complete on result event", () => {
      let buffer = createStreamBuffer()

      buffer = updateBuffer(buffer, { type: "assistant", text: "Test", sessionId: null })
      expect(buffer.isComplete).toBe(false)

      buffer = updateBuffer(buffer, { type: "result", text: null, sessionId: "sess-456" })
      expect(buffer.isComplete).toBe(true)
      expect(buffer.sessionId).toBe("sess-456")
    })

    it("should preserve content through system events", () => {
      let buffer = createStreamBuffer()

      buffer = updateBuffer(buffer, { type: "assistant", text: "Start", sessionId: null })
      buffer = updateBuffer(buffer, { type: "system", text: null, sessionId: null })
      buffer = updateBuffer(buffer, { type: "assistant", text: " End", sessionId: null })

      expect(buffer.content).toBe("Start End")
    })

    it("should track last event", () => {
      let buffer = createStreamBuffer()

      const event1: ParsedStreamEvent = { type: "assistant", text: "First", sessionId: null }
      buffer = updateBuffer(buffer, event1)
      expect(buffer.lastEvent).toEqual(event1)

      const event2: ParsedStreamEvent = { type: "system", text: null, sessionId: null }
      buffer = updateBuffer(buffer, event2)
      expect(buffer.lastEvent).toEqual(event2)
    })
  })

  describe("NDJSON stream processing", () => {
    it.effect("should process multiple lines from stream", () =>
      Effect.gen(function* () {
        // Real Claude format with nested message.content
        const ndjson = `{"type":"assistant","message":{"content":[{"type":"text","text":"Hello "}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"world!"}]}}
{"type":"result","session_id":"sess-789","result":"Hello world!"}`

        const lines = ndjson.split("\n")
        let buffer = createStreamBuffer()

        for (const line of lines) {
          const event = parseStreamLine(line)
          if (event) {
            buffer = updateBuffer(buffer, event)
          }
        }

        expect(buffer.content).toBe("Hello world!")
        expect(buffer.isComplete).toBe(true)
        expect(buffer.sessionId).toBe("sess-789")
      })
    )

    it.effect("should handle mixed event types", () =>
      Effect.gen(function* () {
        const events = [
          '{"type":"system","subtype":"init"}',
          '{"type":"assistant","message":{"content":[{"type":"text","text":"I will "}]}}',
          '{"type":"assistant","message":{"content":[{"type":"text","text":"help you."}]}}',
          '{"type":"user"}',
          '{"type":"result","session_id":"sess-abc","subtype":"success"}'
        ]

        let buffer = createStreamBuffer()

        for (const line of events) {
          const event = parseStreamLine(line)
          if (event) {
            buffer = updateBuffer(buffer, event)
          }
        }

        expect(buffer.content).toBe("I will help you.")
        expect(buffer.isComplete).toBe(true)
      })
    )
  })

  describe("Rate limiting logic", () => {
    it("should calculate update intervals", () => {
      // Update interval should be at least 1 second to avoid Discord rate limits
      const MIN_UPDATE_INTERVAL_MS = 1000
      const MAX_UPDATE_INTERVAL_MS = 3000

      // For short content, use max interval
      const shortContentInterval = Math.min(
        MAX_UPDATE_INTERVAL_MS,
        Math.max(MIN_UPDATE_INTERVAL_MS, 100 * 30) // 30ms per char = 3000ms
      )
      expect(shortContentInterval).toBe(MAX_UPDATE_INTERVAL_MS)

      // For medium content (500 chars), bounded by max (500 * 3 = 1500)
      const mediumContentInterval = Math.min(
        MAX_UPDATE_INTERVAL_MS,
        Math.max(MIN_UPDATE_INTERVAL_MS, 500 * 3)
      )
      expect(mediumContentInterval).toBe(1500) // 500 * 3 = 1500, between min and max
    })
  })
})
