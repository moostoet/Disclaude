import { Effect, Option } from "effect"
import { SessionStore, SessionNotFoundError } from "../Session/SessionStore.ts"
import type { SessionStateType } from "../Session/Schema.ts"

// Service interface for managing Claude session continuity
export interface SessionContinuityShape {
  // Get the Claude session ID for a Discord channel (for --resume)
  readonly getClaudeSessionId: (
    channelId: string
  ) => Effect.Effect<Option.Option<string>>

  // Store the Claude session ID after a successful execution
  readonly storeClaudeSessionId: (
    channelId: string,
    projectPath: string,
    claudeSessionId: string
  ) => Effect.Effect<void>

  // Update the session state (idle, awaiting_response, awaiting_input)
  readonly updateSessionState: (
    channelId: string,
    state: SessionStateType
  ) => Effect.Effect<void, SessionNotFoundError>

  // Clear the Claude session (start fresh conversation)
  readonly clearSession: (channelId: string) => Effect.Effect<void>
}

// Session Continuity Service - bridges Discord sessions to Claude sessions
export class SessionContinuity extends Effect.Service<SessionContinuity>()(
  "Disclaude/SessionContinuity",
  {
    effect: Effect.gen(function* () {
      const store = yield* SessionStore

      const getClaudeSessionId = (
        channelId: string
      ): Effect.Effect<Option.Option<string>> =>
        Effect.gen(function* () {
          const session = yield* store.get(channelId)
          if (Option.isNone(session)) {
            return Option.none()
          }
          const claudeId = session.value.claudeSessionId
          return claudeId ? Option.some(claudeId) : Option.none()
        })

      const storeClaudeSessionId = (
        channelId: string,
        projectPath: string,
        claudeSessionId: string
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          // Get or create the Discord session
          const session = yield* store.getOrCreate(channelId, projectPath)

          // Update with Claude session ID
          yield* store
            .update(channelId, (s) => ({
              ...s,
              claudeSessionId,
              state: "idle" as const
            }))
            .pipe(Effect.orDie) // Should never fail since we just created it
        })

      const updateSessionState = (
        channelId: string,
        state: SessionStateType
      ): Effect.Effect<void, SessionNotFoundError> =>
        store.update(channelId, (s) => ({ ...s, state })).pipe(Effect.asVoid)

      const clearSession = (channelId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const session = yield* store.get(channelId)
          if (Option.isNone(session)) {
            return // Nothing to clear
          }

          yield* store
            .update(channelId, (s) => ({
              ...s,
              claudeSessionId: undefined,
              state: "idle" as const
            }))
            .pipe(Effect.orDie)
        })

      return {
        getClaudeSessionId,
        storeClaudeSessionId,
        updateSessionState,
        clearSession
      } satisfies SessionContinuityShape
    }),
    dependencies: [SessionStore.Default]
  }
) {}
