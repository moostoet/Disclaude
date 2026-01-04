import { Command, CommandExecutor } from "@effect/platform"
import { Data, Effect, Stream, Ref, pipe, Duration } from "effect"
import { AppConfig, AppConfigLive } from "../Config/index.ts"

// Simplified stream event - we only need type and extracted text
export interface ParsedStreamEvent {
  readonly type: "assistant" | "system" | "result" | "user" | "unknown"
  readonly text: string | null
  readonly sessionId: string | null
}

// Options for streaming execution
export interface ClaudeStreamOptions {
  readonly prompt: string
  readonly sessionId?: string
  readonly workingDirectory?: string
  readonly allowedTools?: ReadonlyArray<string>
  readonly systemPrompt?: string
  readonly model?: string
  readonly timeoutMs?: number
}

// Build command line arguments for Claude CLI with streaming
export const buildStreamingArgs = (options: ClaudeStreamOptions): Array<string> => {
  const args: Array<string> = []

  // Non-interactive mode with stream-json output
  // --verbose is required for stream-json with -p
  args.push("-p", options.prompt)
  args.push("--output-format", "stream-json")
  args.push("--verbose")

  // Skip permission prompts
  args.push("--dangerously-skip-permissions")

  // Resume session if provided
  if (options.sessionId) {
    args.push("--resume", options.sessionId)
  }

  // Allowed tools
  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push("--allowedTools", options.allowedTools.join(","))
  }

  // System prompt
  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt)
  }

  // Model selection
  if (options.model) {
    args.push("--model", options.model)
  }

  return args
}

// Tagged error for streaming failures
export class StreamingBridgeError extends Data.TaggedError("StreamingBridgeError")<{
  readonly type: string
  readonly message: string
  readonly cause?: unknown
}> {}

// Buffer that accumulates streaming content
export interface StreamBuffer {
  readonly content: string
  readonly sessionId: string | null
  readonly isComplete: boolean
  readonly lastEvent: ParsedStreamEvent | null
}

export const createStreamBuffer = (): StreamBuffer => ({
  content: "",
  sessionId: null,
  isComplete: false,
  lastEvent: null
})

export const updateBuffer = (buffer: StreamBuffer, event: ParsedStreamEvent): StreamBuffer => {
  const newBuffer = { ...buffer, lastEvent: event }

  switch (event.type) {
    case "assistant":
      if (event.text) {
        return { ...newBuffer, content: buffer.content + event.text }
      }
      return newBuffer
    case "result":
      return {
        ...newBuffer,
        isComplete: true,
        sessionId: event.sessionId ?? buffer.sessionId
      }
    default:
      return newBuffer
  }
}

// Extract text from assistant message content array
const extractAssistantText = (message: unknown): string | null => {
  if (!message || typeof message !== "object") return null
  const msg = message as Record<string, unknown>
  const content = msg.content
  if (!Array.isArray(content)) return null

  // Concatenate all text blocks
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
export const parseStreamLine = (line: string): ParsedStreamEvent | null => {
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

// Rate limiting constants for Discord updates
export const MIN_UPDATE_INTERVAL_MS = 1000
export const MAX_UPDATE_INTERVAL_MS = 3000

// Calculate update interval based on content length
export const calculateUpdateInterval = (contentLength: number): number => {
  const dynamicInterval = contentLength * 3 // 3ms per character
  return Math.min(
    MAX_UPDATE_INTERVAL_MS,
    Math.max(MIN_UPDATE_INTERVAL_MS, dynamicInterval)
  )
}

// Stream result with session info
export interface StreamResult {
  readonly content: string
  readonly sessionId: string | null
}

// Callback for streaming updates
export type StreamUpdateCallback = (content: string) => Effect.Effect<void>

// Service interface
export interface StreamingBridgeShape {
  readonly executeStreaming: (
    options: ClaudeStreamOptions,
    onUpdate?: StreamUpdateCallback
  ) => Effect.Effect<StreamResult, StreamingBridgeError>
}

// Streaming Bridge Service - executes Claude with streaming output
export class StreamingBridge extends Effect.Service<StreamingBridge>()("Disclaude/StreamingBridge", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const executor = yield* CommandExecutor.CommandExecutor

    const executeStreaming = (
      options: ClaudeStreamOptions,
      onUpdate?: StreamUpdateCallback
    ): Effect.Effect<StreamResult, StreamingBridgeError> =>
      Effect.gen(function* () {
        // Build command arguments
        const args = buildStreamingArgs({
          ...options,
          allowedTools:
            options.allowedTools && options.allowedTools.length > 0
              ? options.allowedTools
              : config.claudeAllowedTools
        })

        yield* Effect.log(`Running streaming: claude ${args.join(" ")}`)

        // Create command with empty stdin
        let command = Command.make("claude", ...args).pipe(
          Command.stdin(Stream.empty)
        )

        if (options.workingDirectory) {
          command = Command.workingDirectory(command, options.workingDirectory)
        }

        // Track buffer state and last update time
        const bufferRef = yield* Ref.make(createStreamBuffer())
        const lastUpdateRef = yield* Ref.make(0)

        // Process the command output as a stream of lines
        const timeoutMs = options.timeoutMs ?? 300_000 // 5 minutes for streaming

        yield* pipe(
          Command.lines(command),
          Stream.provideService(CommandExecutor.CommandExecutor, executor),
          // Flatten array chunks into individual lines
          Stream.mapConcat((lines) => lines),
          Stream.runForEach((line) =>
            Effect.gen(function* () {
              const event = parseStreamLine(line)
              if (!event) return

              // Update the buffer
              yield* Ref.update(bufferRef, (buf) => updateBuffer(buf, event))

              // Call update callback if provided (rate limited)
              if (onUpdate && event.type === "assistant") {
                const now = Date.now()
                const lastUpdate = yield* Ref.get(lastUpdateRef)
                const buffer = yield* Ref.get(bufferRef)

                const interval = calculateUpdateInterval(buffer.content.length)
                if (now - lastUpdate >= interval) {
                  yield* Ref.set(lastUpdateRef, now)
                  yield* onUpdate(buffer.content)
                }
              }
            })
          ),
          Effect.timeoutFail({
            duration: Duration.millis(timeoutMs),
            onTimeout: () => new StreamingBridgeError({
              type: "timeout",
              message: `Streaming timed out after ${timeoutMs}ms`
            })
          }),
          Effect.mapError((err) => {
            if (err instanceof StreamingBridgeError) return err
            return new StreamingBridgeError({
              type: "stream_error",
              message: `Streaming failed: ${err}`,
              cause: err
            })
          })
        )

        // Get final buffer state
        const finalBuffer = yield* Ref.get(bufferRef)

        // Call final update if there's content
        if (onUpdate && finalBuffer.content.length > 0) {
          yield* onUpdate(finalBuffer.content)
        }

        return {
          content: finalBuffer.content,
          sessionId: finalBuffer.sessionId
        }
      })

    return { executeStreaming } satisfies StreamingBridgeShape
  }),
  dependencies: [AppConfigLive]
}) {}
