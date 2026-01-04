# Effect-TS Discord Bot Reference

Reference: `/tmp/effect-discord-bot` (cloned from github.com/Effect-TS/discord-bot)

## Key Dependencies

- `dfx` - Discord for Effect (gateway, REST, interactions)
- `@effect/ai` + `@effect/ai-openai` - AI integration
- `@effect/cluster` - Distributed entity management
- `@effect/workflow` - Durable workflows

## Architecture Patterns

### Discord Config Layer
```typescript
import { DiscordConfig, Intents } from "dfx"
import { Config } from "effect"

export const DiscordConfigLayer = DiscordConfig.layerConfig({
  token: Config.redacted("DISCORD_BOT_TOKEN"),
  gateway: {
    intents: Config.succeed(
      Intents.fromList(["GuildMessages", "MessageContent", "Guilds"])
    )
  }
})
```

### Gateway Event Handling
```typescript
const run = gateway.handleDispatch("MESSAGE_CREATE", 
  Effect.fnUntraced(function*(message) {
    // Handle message
  },
  Effect.catchTag("ParseError", Effect.logDebug),
  (effect, event) => Effect.withSpan(effect, "Handler.name"),
  Effect.catchAllCause(Effect.logError)
))
yield* Effect.forkScoped(run)
```

### Service Pattern with Dependencies
```typescript
export class MyService extends Effect.Service<MyService>()("app/MyService", {
  effect: Effect.gen(function*() {
    const dep = yield* SomeDependency
    return { method: () => Effect.succeed("result") }
  }),
  dependencies: [SomeDependency.Default]
}) {}
```

### Layer Composition (main.ts pattern)
```typescript
const MainLive = Layer.mergeAll(
  Feature1Live,
  Feature2Live,
  Feature3Live
).pipe(
  Layer.provide(TracerLayer("app-name")),
  Layer.provide(LogLevelLive)
)

NodeRuntime.runMain(Layer.launch(MainLive))
```

### Tagged Errors
```typescript
class MyError extends Data.TaggedError("MyError")<{
  readonly reason: "a" | "b" | "c"
}> {}

// Usage with catchTag
Effect.catchTag("MyError", (_) => Effect.void)
```

### Schema Validation for Messages
```typescript
const EligibleMessage = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal(Discord.MessageType.DEFAULT),
  author: Schema.Struct({
    bot: Schema.optional(Schema.Literal(false))
  })
}).pipe(Schema.decodeUnknown)

// Usage
const message = yield* EligibleMessage(event)
```

### Interaction Handlers (buttons, modals)
```typescript
const handler = Ix.messageComponent(
  Ix.idStartsWith("prefix_"),
  pipe(
    Ix.Interaction,
    Effect.map((ix) => Ix.response({
      type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: "Response" }
    }))
  )
)

yield* registry.register(Ix.builder.add(handler))
```

## File Structure Reference

```
packages/
  discord/          # Core Discord integration
    DiscordConfig.ts
    DiscordGateway.ts
    DiscordRest.ts
  discord-bot/      # Bot features
    main.ts         # Entry point
    Ai.ts           # AI helpers
    AutoThreads.ts  # Auto-threading
    Mentions.ts     # @mention handling
  domain/           # Domain models
    Conversation.ts # Entity definitions
  shared/           # Shared utilities
    Otel.ts         # OpenTelemetry
    Sql.ts          # Database
```
