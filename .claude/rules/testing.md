# Testing Patterns

- Use `@effect/vitest` with `it.effect()` for Effect-based tests
- Import dfx services via module import: `import * as DfxConfig from "dfx/DiscordConfig"`
- Access dfx Context.Tags via `DfxConfig.DiscordConfig` (not direct import)
- Test layers with mock ConfigProvider: `Layer.setConfigProvider(ConfigProvider.fromMap(...))`
- Use `Effect.provide(TestLayer)` to provide test dependencies

## Test File Structure

```
test/
  Config/AppConfig.test.ts
  Discord/DiscordConfig.test.ts
  Discord/DiscordGateway.test.ts
  main.test.ts
```

## Layer Testing Pattern

```typescript
const TestLayer = MyLayer.pipe(
  Layer.provide(Layer.setConfigProvider(
    ConfigProvider.fromMap(new Map([["KEY", "value"]]))
  ))
)

it.effect("test name", () =>
  Effect.gen(function* () {
    const service = yield* MyService
    expect(service.value).toBe("expected")
  }).pipe(Effect.provide(TestLayer))
)
```
