// Discord message limit
const DISCORD_MESSAGE_LIMIT = 2000

/**
 * Split a long message into chunks that fit Discord's limit.
 * Tries to split at newlines to preserve readability.
 */
export const splitMessage = (
  text: string,
  limit: number = DISCORD_MESSAGE_LIMIT
): Array<string> => {
  if (text.length <= limit) {
    return [text]
  }

  const chunks: Array<string> = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }

    // Try to find a good split point (newline) within the limit
    let splitIndex = remaining.lastIndexOf("\n", limit)

    // If no newline found, try space
    if (splitIndex === -1 || splitIndex === 0) {
      splitIndex = remaining.lastIndexOf(" ", limit)
    }

    // If still no good split point, force split at limit
    if (splitIndex === -1 || splitIndex === 0) {
      splitIndex = limit
    }

    chunks.push(remaining.slice(0, splitIndex))
    remaining = remaining.slice(splitIndex).trimStart()
  }

  return chunks
}

/**
 * Format text for Discord, escaping dangerous mentions.
 * Preserves markdown and user mentions but escapes @everyone/@here.
 */
export const formatForDiscord = (text: string): string => {
  // Escape @everyone and @here with zero-width space to prevent pings
  return text
    .replace(/@everyone/g, "@\u200Beveryone")
    .replace(/@here/g, "@\u200Bhere")
}

/**
 * Truncate text with ellipsis if it exceeds the limit.
 */
export const truncateWithEllipsis = (text: string, limit: number): string => {
  if (text.length <= limit) {
    return text
  }
  return text.slice(0, limit - 3) + "..."
}

/**
 * Extract the prompt from a message that mentions the bot.
 * Returns null if the bot is not mentioned.
 *
 * Handles both <@botId> and <@!botId> (nickname) formats.
 */
export const extractMentionedPrompt = (
  content: string,
  botId: string
): string | null => {
  // Match both regular and nickname mention formats
  const mentionRegex = new RegExp(`<@!?${botId}>`, "g")
  const match = mentionRegex.exec(content)

  if (!match) {
    return null
  }

  // Extract everything after the mention
  const afterMention = content.slice(match.index + match[0].length)
  return afterMention.trim()
}

/**
 * Format Claude's response for Discord.
 * Handles splitting, escaping, and formatting.
 */
export const formatClaudeResponse = (
  response: string
): Array<string> => {
  const formatted = formatForDiscord(response)
  return splitMessage(formatted)
}
