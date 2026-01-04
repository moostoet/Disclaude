import { DiscordREST, DiscordRESTMemoryLive } from "dfx"
import { FetchHttpClient } from "@effect/platform"
import { Effect, Layer } from "effect"
import { DiscordConfigLayer } from "./DiscordConfig.ts"

// Use Fetch client (works in Bun natively)
const HttpClientLayer = FetchHttpClient.layer

// REST API layer - provides DiscordREST service
export const DiscordRestBase = DiscordRESTMemoryLive.pipe(
  Layer.provide(HttpClientLayer),
  Layer.provide(DiscordConfigLayer)
)

// Application info service - fetches bot application details
export class DiscordApplication extends Effect.Service<DiscordApplication>()(
  "Disclaude/DiscordApplication",
  {
    effect: DiscordREST.pipe(
      Effect.flatMap((_) => _.getMyApplication()),
      Effect.orDie
    ),
    dependencies: [DiscordRestBase]
  }
) {}

// Full REST layer with application info
export const DiscordRestLayer = Layer.merge(
  DiscordRestBase,
  DiscordApplication.Default
)
