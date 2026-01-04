import { Command, CommandExecutor } from "@effect/platform"
import { Data, Effect, Schema, Stream } from "effect"
import { AppConfig, AppConfigLive } from "../Config/index.ts"
import { ClaudeResponse } from "./Schema.ts"

// Options for executing Claude CLI
export interface ClaudeExecuteOptions {
  readonly prompt: string
  readonly sessionId?: string
  readonly workingDirectory?: string
  readonly allowedTools?: ReadonlyArray<string>
  readonly systemPrompt?: string
  readonly model?: string
  readonly timeoutMs?: number
}

// Build command line arguments for Claude CLI
export const buildClaudeArgs = (options: ClaudeExecuteOptions): Array<string> => {
  const args: Array<string> = []

  // Non-interactive mode with JSON output
  args.push("-p", options.prompt)
  args.push("--output-format", "json")

  // Skip permission prompts (we control this via allowed tools)
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

// Tagged error for Claude process failures
export class ClaudeProcessError extends Data.TaggedError("ClaudeProcessError")<{
  readonly type: string
  readonly message: string
  readonly exitCode?: number
  readonly stderr?: string
}> {}

// Service interface
export interface ClaudeProcessShape {
  readonly execute: (
    options: ClaudeExecuteOptions
  ) => Effect.Effect<ClaudeResponse, ClaudeProcessError>
}

// Claude Process Service - spawns and manages Claude CLI
export class ClaudeProcess extends Effect.Service<ClaudeProcess>()("Disclaude/ClaudeProcess", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const executor = yield* CommandExecutor.CommandExecutor

    const execute = (
      options: ClaudeExecuteOptions
    ): Effect.Effect<ClaudeResponse, ClaudeProcessError> =>
      Effect.gen(function* () {
        // Build command arguments
        const args = buildClaudeArgs({
          ...options,
          // Merge config allowed tools with request-specific ones
          allowedTools:
            options.allowedTools && options.allowedTools.length > 0
              ? options.allowedTools
              : config.claudeAllowedTools
        })

        yield* Effect.log(`Running: claude ${args.join(" ")}`)
        yield* Effect.log(`Working directory: ${options.workingDirectory ?? "default"}`)

        // Create command with empty stdin (prevents hanging)
        let command = Command.make("claude", ...args).pipe(
          Command.stdin(Stream.empty)
        )

        // Set working directory if provided
        if (options.workingDirectory) {
          command = Command.workingDirectory(command, options.workingDirectory)
        }

        // Execute and capture output with 2 minute timeout
        const timeoutMs = options.timeoutMs ?? 120_000
        const output = yield* Command.string(command).pipe(
          Effect.provideService(CommandExecutor.CommandExecutor, executor),
          Effect.timeoutFail({
            duration: `${timeoutMs} millis`,
            onTimeout: () => new ClaudeProcessError({
              type: "timeout",
              message: `Claude CLI timed out after ${timeoutMs}ms`
            })
          }),
          Effect.mapError((err) => {
            if (err instanceof ClaudeProcessError) return err
            const stderrValue = "reason" in err ? String(err.reason) : undefined
            return new ClaudeProcessError({
              type: "process_error",
              message: `Failed to execute Claude CLI: ${err.message}`,
              ...(stderrValue !== undefined ? { stderr: stderrValue } : {})
            })
          })
        )

        yield* Effect.log(`Claude CLI returned ${output.length} bytes`)

        // Parse JSON response
        const parsed = yield* Effect.try({
          try: () => JSON.parse(output),
          catch: (err) =>
            new ClaudeProcessError({
              type: "parse_error",
              message: `Failed to parse Claude response: ${err}`
            })
        })

        // Validate against schema
        const response = yield* Schema.decodeUnknown(ClaudeResponse)(parsed).pipe(
          Effect.mapError((err) =>
            new ClaudeProcessError({
              type: "schema_error",
              message: `Invalid Claude response format: ${err.message}`
            })
          )
        )

        // Check for error in response
        if (response.is_error) {
          return yield* new ClaudeProcessError({
            type: "claude_error",
            message: response.result
          })
        }

        return response
      })

    return { execute } satisfies ClaudeProcessShape
  }),
  dependencies: [AppConfigLive]
}) {}
