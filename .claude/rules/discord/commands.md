---
globs: ["src/Discord/Commands/**/*.ts"]
---

# dfx Slash Command Registration

## Command Types

- `Ix.global()` - Global commands, propagate to all servers (up to 1 hour delay)
- `Ix.guild()` - Guild-specific commands, instant updates (recommended for development)

## Registration Pattern

```typescript
import { Ix } from "dfx"
import { InteractionsRegistry } from "dfx/gateway"

const make = Effect.gen(function* () {
  const registry = yield* InteractionsRegistry
  
  const command = Ix.guild({
    name: "mycommand",
    description: "Description here",
    options: [/* subcommands/options */]
  }, handler)
  
  const ix = Ix.builder.add(command).catchAllCause(Effect.logError)
  yield* registry.register(ix)
})

export const CommandLive = Layer.scopedDiscard(make)
```

## How It Works

- `InteractionsRegistry.register()` queues commands for sync
- dfx's `DiscordIxLive` handles sync in a background fiber
- Calls `bulkSetApplicationCommands` or `bulkSetGuildApplicationCommands`
- Retry logic with exponential backoff for transient errors

## Best Practices

- Use `Ix.guild()` during development for instant updates
- Switch to `Ix.global()` for production
- Guild commands require the bot to be in the guild
