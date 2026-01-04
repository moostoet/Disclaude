# Platform Compatibility

## Runtime

- Always run with `bun src/main.ts` (not npm/node)
- Use `@effect/platform-bun` for Bun-specific layers (BunRuntime, BunSocket)
- Use `BunRuntime.runMain()` for the entry point
- Use `BunSocket.layerWebSocketConstructor` for WebSocket connections

## Testing

- Tests run via vitest (Node environment)
- Test files may need platform-agnostic mocks
- `FetchHttpClient.layer` works in both Bun and Node 18+

## Discord Gateway Behavior

- `Layer.launch(DiscordGatewayLayer)` connects and runs forever (never resolves)
- This is expected - the bot stays connected handling events
- Use `Ctrl+C` to stop the bot
- Enable logging with `Effect.provide(Logger.pretty)` to see connection logs
