# Runtime

- Always use `bun` to run this program, not `npm` or `node`
- Use `@effect/platform-bun` for Bun-specific layers (BunRuntime, BunHttpClient, etc.)
- Use `BunRuntime.runMain()` instead of `Effect.runPromise()` for the entry point
