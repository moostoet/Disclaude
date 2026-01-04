# Effect Platform Command

## Stdin Handling

When spawning processes with `@effect/platform` Command module:
- Commands may hang if stdin is left open
- Use `Command.stdin(Stream.empty)` to close stdin immediately
- This prevents processes from waiting for input that never comes

```typescript
const command = Command.make("claude", ...args).pipe(
  Command.stdin(Stream.empty)
)
```
