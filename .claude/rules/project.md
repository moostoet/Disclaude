# Project Setup

- Package manager: bun
- Runtime: Bun with Effect TypeScript
- Project type: Discord-to-Claude-Code bridge application

## Commands

- `bun run prepare` - Patch Effect language service
- `bun run typecheck` - Type check the project
- `bun run test` - Run tests
- `bun run test:watch` - Run tests in watch mode
- `bun run index.ts` - Run the application

## Effect Packages

- `effect` - Core library
- `@effect/platform` - HTTP client, streams
- `@effect/platform-node` - Node.js runtime layer
- `dfx` - Discord for Effect (gateway, REST, interactions)

## Project Structure

```
src/
  Config/index.ts      - AppConfig service (env vars)
  Discord/
    DiscordConfig.ts   - dfx Discord configuration
    DiscordGateway.ts  - Gateway and REST layers
    index.ts           - Discord module exports
  main.ts              - Application entry point

test/
  Config/              - Config tests
  Discord/             - Discord layer tests
  main.test.ts         - Main entry tests
```
