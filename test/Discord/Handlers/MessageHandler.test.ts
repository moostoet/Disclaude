import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import {
  isEligibleMessage,
  type MessageEligibility
} from "../../../src/Discord/Handlers/MessageHandler.ts"
import type { Discord } from "dfx"

describe("MessageHandler", () => {
  const botId = "123456789"

  // Helper to create mock messages
  const createMockMessage = (
    overrides: Partial<{
      authorBot: boolean
      authorId: string
      mentions: Array<{ id: string }>
      content: string
      channelId: string
    }> = {}
  ): Discord.GatewayMessageCreateDispatchData => ({
    id: "msg-1",
    channel_id: overrides.channelId ?? "channel-1",
    author: {
      id: overrides.authorId ?? "user-1",
      username: "testuser",
      discriminator: "0001",
      bot: overrides.authorBot ?? false,
      avatar: null,
      global_name: null
    },
    content: overrides.content ?? "<@123456789> Hello bot",
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: overrides.mentions ?? [{ id: "123456789" }],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0
  }) as unknown as Discord.GatewayMessageCreateDispatchData

  describe("isEligibleMessage", () => {
    it.effect("should accept message that mentions bot from non-bot user", () =>
      Effect.gen(function* () {
        const message = createMockMessage({
          mentions: [{ id: botId }],
          content: "<@123456789> What is TypeScript?"
        })

        const result = isEligibleMessage(message, botId)

        expect(result._tag).toBe("Eligible")
        if (result._tag === "Eligible") {
          expect(result.prompt).toBe("What is TypeScript?")
          expect(result.channelId).toBe("channel-1")
        }
      })
    )

    it.effect("should reject message from bot author", () =>
      Effect.gen(function* () {
        const message = createMockMessage({
          authorBot: true,
          mentions: [{ id: botId }]
        })

        const result = isEligibleMessage(message, botId)

        expect(result._tag).toBe("NotEligible")
        if (result._tag === "NotEligible") {
          expect(result.reason).toBe("from_bot")
        }
      })
    )

    it.effect("should reject message that doesn't mention bot", () =>
      Effect.gen(function* () {
        const message = createMockMessage({
          mentions: [],
          content: "Hello everyone"
        })

        const result = isEligibleMessage(message, botId)

        expect(result._tag).toBe("NotEligible")
        if (result._tag === "NotEligible") {
          expect(result.reason).toBe("not_mentioned")
        }
      })
    )

    it.effect("should reject message with empty prompt", () =>
      Effect.gen(function* () {
        const message = createMockMessage({
          mentions: [{ id: botId }],
          content: "<@123456789>"
        })

        const result = isEligibleMessage(message, botId)

        expect(result._tag).toBe("NotEligible")
        if (result._tag === "NotEligible") {
          expect(result.reason).toBe("empty_prompt")
        }
      })
    )

    it.effect("should handle nickname mention format", () =>
      Effect.gen(function* () {
        const message = createMockMessage({
          mentions: [{ id: botId }],
          content: "<@!123456789> Help me"
        })

        const result = isEligibleMessage(message, botId)

        expect(result._tag).toBe("Eligible")
        if (result._tag === "Eligible") {
          expect(result.prompt).toBe("Help me")
        }
      })
    )

    it.effect("should extract channel ID correctly", () =>
      Effect.gen(function* () {
        const message = createMockMessage({
          channelId: "test-channel-456",
          mentions: [{ id: botId }],
          content: "<@123456789> Test"
        })

        const result = isEligibleMessage(message, botId)

        expect(result._tag).toBe("Eligible")
        if (result._tag === "Eligible") {
          expect(result.channelId).toBe("test-channel-456")
        }
      })
    )
  })
})
