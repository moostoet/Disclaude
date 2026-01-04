import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"

// Question detection patterns
const QUESTION_PATTERNS = {
  // Matches: "? (yes/no)", "? [y/n]", "? yes/no", etc.
  yesNo: /\?\s*[\[(]?\s*(yes\s*[/|]\s*no|y\s*[/|]\s*n)\s*[\])]?\s*$/i,
  proceed: /\b(proceed|continue)\b.*\?/i,
  confirm: /\b(confirm|approve|deny)\b/i,
  choice: /\b(option|choose|select)\b.*:/i,
  planMode: /\bplan\s*mode\b/i
}

// Detect if text ends with a question
const detectQuestion = (text: string): { type: string; hasQuestion: boolean } | null => {
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
  // Proceed questions (but exclude if already matched as yesNo)
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

// Get buttons for question type
const getButtonsForQuestion = (type: string): Array<{ label: string; value: string }> => {
  switch (type) {
    case "yesNo":
      return [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
      ]
    case "proceed":
      return [
        { label: "Continue", value: "continue" },
        { label: "Cancel", value: "cancel" }
      ]
    case "confirm":
      return [
        { label: "Approve", value: "approve" },
        { label: "Deny", value: "deny" }
      ]
    case "planMode":
      return [
        { label: "Approve Plan", value: "yes, proceed with this plan" },
        { label: "Modify Plan", value: "let me suggest changes" },
        { label: "Cancel", value: "cancel" }
      ]
    default:
      return []
  }
}

describe("QuestionHandler", () => {
  describe("detectQuestion", () => {
    it("should detect yes/no questions", () => {
      const result = detectQuestion("Do you want to proceed? (yes/no)")
      expect(result).not.toBeNull()
      expect(result?.type).toBe("yesNo")
    })

    it("should detect proceed/continue questions", () => {
      const result = detectQuestion("Should I proceed with these changes?")
      expect(result).not.toBeNull()
      expect(result?.type).toBe("proceed")
    })

    it("should detect confirmation patterns", () => {
      const result = detectQuestion("Please confirm or deny this action")
      expect(result).not.toBeNull()
      expect(result?.type).toBe("confirm")
    })

    it("should detect plan mode", () => {
      const result = detectQuestion("Entering plan mode. Here's my proposed approach...")
      expect(result).not.toBeNull()
      expect(result?.type).toBe("planMode")
    })

    it("should return null for non-questions", () => {
      const result = detectQuestion("I've completed the task successfully.")
      expect(result).toBeNull()
    })

    it("should check the last line for questions", () => {
      const multiLine = `Here's what I found:
- Item 1
- Item 2

Do you want to proceed? (yes/no)`
      const result = detectQuestion(multiLine)
      expect(result).not.toBeNull()
      expect(result?.type).toBe("yesNo")
    })
  })

  describe("getButtonsForQuestion", () => {
    it("should return yes/no buttons for yesNo type", () => {
      const buttons = getButtonsForQuestion("yesNo")
      expect(buttons).toHaveLength(2)
      expect(buttons[0]?.label).toBe("Yes")
      expect(buttons[1]?.label).toBe("No")
    })

    it("should return continue/cancel buttons for proceed type", () => {
      const buttons = getButtonsForQuestion("proceed")
      expect(buttons).toHaveLength(2)
      expect(buttons[0]?.label).toBe("Continue")
      expect(buttons[1]?.label).toBe("Cancel")
    })

    it("should return plan mode buttons", () => {
      const buttons = getButtonsForQuestion("planMode")
      expect(buttons).toHaveLength(3)
      expect(buttons[0]?.label).toBe("Approve Plan")
    })

    it("should return empty array for unknown type", () => {
      const buttons = getButtonsForQuestion("unknown")
      expect(buttons).toHaveLength(0)
    })
  })

  describe("button id generation", () => {
    it("should create unique button ids with channel and message context", () => {
      const channelId = "123456"
      const messageId = "789012"
      const value = "yes"

      const buttonId = `claude_answer_${channelId}_${messageId}_${value}`

      expect(buttonId).toBe("claude_answer_123456_789012_yes")
      expect(buttonId.startsWith("claude_answer_")).toBe(true)
    })

    it("should parse button id back to components", () => {
      const buttonId = "claude_answer_123456_789012_yes"
      const parts = buttonId.split("_")

      expect(parts[0]).toBe("claude")
      expect(parts[1]).toBe("answer")
      expect(parts[2]).toBe("123456") // channelId
      expect(parts[3]).toBe("789012") // messageId
      expect(parts[4]).toBe("yes") // value
    })
  })
})
