import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import {
  splitMessage,
  formatForDiscord,
  truncateWithEllipsis,
  extractMentionedPrompt
} from "../../src/Discord/ResponseFormatter.ts"

describe("splitMessage", () => {
  it.effect("should return single chunk for short message", () =>
    Effect.gen(function* () {
      const chunks = splitMessage("Hello world", 2000)
      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toBe("Hello world")
    })
  )

  it.effect("should split long message at newlines", () =>
    Effect.gen(function* () {
      const longMessage = "Line 1\nLine 2\nLine 3\nLine 4"
      const chunks = splitMessage(longMessage, 15)

      expect(chunks.length).toBeGreaterThan(1)
      // Each chunk should be under the limit
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(15)
      })
    })
  )

  it.effect("should preserve code blocks when splitting", () =>
    Effect.gen(function* () {
      const messageWithCode = "Here is code:\n```javascript\nconst x = 1;\n```\nMore text"
      const chunks = splitMessage(messageWithCode, 2000)

      // Code block should remain intact
      const fullMessage = chunks.join("")
      expect(fullMessage).toContain("```javascript")
      expect(fullMessage).toContain("```")
    })
  )

  it.effect("should handle very long single lines", () =>
    Effect.gen(function* () {
      const longLine = "a".repeat(3000)
      const chunks = splitMessage(longLine, 2000)

      expect(chunks.length).toBeGreaterThan(1)
      // Verify all content is preserved
      expect(chunks.join("").length).toBe(3000)
    })
  )

  it.effect("should use default Discord limit", () =>
    Effect.gen(function* () {
      const message = "a".repeat(2500)
      const chunks = splitMessage(message)

      expect(chunks.length).toBe(2)
      expect(chunks[0]!.length).toBeLessThanOrEqual(2000)
    })
  )
})

describe("formatForDiscord", () => {
  it.effect("should preserve markdown formatting", () =>
    Effect.gen(function* () {
      const text = "**bold** and *italic*"
      const formatted = formatForDiscord(text)
      expect(formatted).toBe("**bold** and *italic*")
    })
  )

  it.effect("should handle code blocks", () =>
    Effect.gen(function* () {
      const text = "```typescript\nconst x = 1;\n```"
      const formatted = formatForDiscord(text)
      expect(formatted).toContain("```typescript")
    })
  )

  it.effect("should escape Discord mentions in output", () =>
    Effect.gen(function* () {
      const text = "Contact @everyone for help"
      const formatted = formatForDiscord(text)
      // Should escape @everyone to prevent actual mentions
      expect(formatted).not.toBe(text)
      expect(formatted).toContain("@\u200Beveryone") // Zero-width space
    })
  )

  it.effect("should escape @here mentions", () =>
    Effect.gen(function* () {
      const text = "Notify @here about this"
      const formatted = formatForDiscord(text)
      expect(formatted).toContain("@\u200Bhere")
    })
  )

  it.effect("should not escape user mentions", () =>
    Effect.gen(function* () {
      const text = "Thanks <@123456789>"
      const formatted = formatForDiscord(text)
      // User mentions should remain intact
      expect(formatted).toBe(text)
    })
  )
})

describe("truncateWithEllipsis", () => {
  it.effect("should not truncate short text", () =>
    Effect.gen(function* () {
      const text = "Short text"
      const result = truncateWithEllipsis(text, 100)
      expect(result).toBe("Short text")
    })
  )

  it.effect("should truncate long text with ellipsis", () =>
    Effect.gen(function* () {
      const text = "This is a very long message that needs truncation"
      const result = truncateWithEllipsis(text, 20)

      expect(result.length).toBeLessThanOrEqual(20)
      expect(result.endsWith("...")).toBe(true)
    })
  )

  it.effect("should handle exact length", () =>
    Effect.gen(function* () {
      const text = "Exact"
      const result = truncateWithEllipsis(text, 5)
      expect(result).toBe("Exact")
    })
  )
})

describe("extractMentionedPrompt", () => {
  it.effect("should extract prompt after bot mention", () =>
    Effect.gen(function* () {
      const content = "<@123456789> What is TypeScript?"
      const botId = "123456789"
      const prompt = extractMentionedPrompt(content, botId)

      expect(prompt).toBe("What is TypeScript?")
    })
  )

  it.effect("should handle nickname mention format", () =>
    Effect.gen(function* () {
      const content = "<@!123456789> Explain this code"
      const botId = "123456789"
      const prompt = extractMentionedPrompt(content, botId)

      expect(prompt).toBe("Explain this code")
    })
  )

  it.effect("should return null if bot not mentioned", () =>
    Effect.gen(function* () {
      const content = "Hello everyone"
      const botId = "123456789"
      const prompt = extractMentionedPrompt(content, botId)

      expect(prompt).toBeNull()
    })
  )

  it.effect("should trim whitespace from prompt", () =>
    Effect.gen(function* () {
      const content = "<@123456789>   What is this?   "
      const botId = "123456789"
      const prompt = extractMentionedPrompt(content, botId)

      expect(prompt).toBe("What is this?")
    })
  )

  it.effect("should handle mention at end of message", () =>
    Effect.gen(function* () {
      const content = "Hey <@123456789>"
      const botId = "123456789"
      const prompt = extractMentionedPrompt(content, botId)

      // Empty prompt after mention
      expect(prompt).toBe("")
    })
  )

  it.effect("should handle multiple mentions, extract after first bot mention", () =>
    Effect.gen(function* () {
      const content = "<@123456789> tell <@999999999> about Effect"
      const botId = "123456789"
      const prompt = extractMentionedPrompt(content, botId)

      expect(prompt).toBe("tell <@999999999> about Effect")
    })
  )
})
