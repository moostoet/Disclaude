import { Data, Effect, HashMap, Option, Ref } from "effect"
import type { DiscordSession } from "./Schema.ts"

// Error types
export class SessionNotFoundError extends Data.TaggedError("SessionNotFoundError")<{
  readonly channelId: string
}> {}

// Session store interface
export interface SessionStoreShape {
  readonly get: (channelId: string) => Effect.Effect<Option.Option<DiscordSession>>
  readonly create: (
    channelId: string,
    projectPath: string,
    threadId?: string
  ) => Effect.Effect<DiscordSession>
  readonly getOrCreate: (
    channelId: string,
    projectPath: string,
    threadId?: string
  ) => Effect.Effect<DiscordSession>
  readonly update: (
    channelId: string,
    fn: (session: DiscordSession) => DiscordSession
  ) => Effect.Effect<DiscordSession, SessionNotFoundError>
  readonly delete: (channelId: string) => Effect.Effect<void>
  readonly list: () => Effect.Effect<ReadonlyArray<DiscordSession>>
}

// In-memory session store using Effect.Service pattern
export class SessionStore extends Effect.Service<SessionStore>()("Disclaude/SessionStore", {
  effect: Effect.gen(function* () {
    const sessions = yield* Ref.make(HashMap.empty<string, DiscordSession>())

    const get = (channelId: string): Effect.Effect<Option.Option<DiscordSession>> =>
      Ref.get(sessions).pipe(Effect.map((map) => HashMap.get(map, channelId)))

    const create = (
      channelId: string,
      projectPath: string,
      threadId?: string
    ): Effect.Effect<DiscordSession> =>
      Effect.gen(function* () {
        const now = new Date().toISOString()
        const session: DiscordSession = {
          channelId,
          threadId,
          claudeSessionId: undefined,
          projectPath,
          state: "idle",
          createdAt: now,
          updatedAt: now
        }
        yield* Ref.update(sessions, (map) => HashMap.set(map, channelId, session))
        return session
      })

    const getOrCreate = (
      channelId: string,
      projectPath: string,
      threadId?: string
    ): Effect.Effect<DiscordSession> =>
      Effect.gen(function* () {
        const existing = yield* get(channelId)
        if (Option.isSome(existing)) {
          return existing.value
        }
        return yield* create(channelId, projectPath, threadId)
      })

    const update = (
      channelId: string,
      fn: (session: DiscordSession) => DiscordSession
    ): Effect.Effect<DiscordSession, SessionNotFoundError> =>
      Effect.gen(function* () {
        const existing = yield* get(channelId)
        if (Option.isNone(existing)) {
          return yield* new SessionNotFoundError({ channelId })
        }
        const updated = fn(existing.value)
        const withTimestamp: DiscordSession = {
          ...updated,
          updatedAt: new Date().toISOString()
        }
        yield* Ref.update(sessions, (map) => HashMap.set(map, channelId, withTimestamp))
        return withTimestamp
      })

    const deleteSession = (channelId: string): Effect.Effect<void> =>
      Ref.update(sessions, (map) => HashMap.remove(map, channelId))

    const list = (): Effect.Effect<ReadonlyArray<DiscordSession>> =>
      Ref.get(sessions).pipe(Effect.map((map) => Array.from(HashMap.values(map))))

    return {
      get,
      create,
      getOrCreate,
      update,
      delete: deleteSession,
      list
    } satisfies SessionStoreShape
  })
}) {}
