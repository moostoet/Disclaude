import { FetchHttpClient } from "@effect/platform"
import { BunContext, BunSocket } from "@effect/platform-bun"
import { DiscordGateway, DiscordIxLive } from "dfx/gateway"
import { Effect, Layer } from "effect"
import { DiscordConfigLayer } from "./DiscordConfig.ts"
import { DiscordApplication, DiscordRestLayer } from "./DiscordApplication.ts"
import { StreamingMessageHandlerLive } from "./Handlers/StreamingMessageHandler.ts"
import { QuestionHandlerLive } from "./Handlers/QuestionHandler.ts"
import { ProjectCommandsLive } from "./Commands/ProjectCommands.ts"
import { SessionCommandsLive } from "./Commands/SessionCommands.ts"
import { AskCommandLive } from "./Commands/AskCommand.ts"
import { ToolsCommandLive } from "./Commands/ToolsCommand.ts"
import { ClaudeProcess } from "../Claude/ClaudeProcess.ts"
import { StreamingBridge } from "../Claude/StreamingBridge.ts"
import { SessionContinuity } from "../Claude/SessionContinuity.ts"
import { ProjectRegistry } from "../Session/ProjectRegistry.ts"
import { AppConfigLive } from "../Config/index.ts"

// Re-export for consumers
export { DiscordApplication, DiscordRestLayer } from "./DiscordApplication.ts"

// Use Fetch client (works in Bun natively)
const HttpClientLayer = FetchHttpClient.layer

// Bun WebSocket constructor for gateway connection
const WebSocketLayer = BunSocket.layerWebSocketConstructor

// Gateway layer - handles WebSocket connection to Discord
const DiscordGatewayBase = DiscordIxLive.pipe(
  Layer.provideMerge(HttpClientLayer),
  Layer.provide(WebSocketLayer),
  Layer.provide(DiscordConfigLayer)
)

// Log when gateway connects successfully
const ConnectionLoggerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    const gateway = yield* DiscordGateway

    const logReady = gateway.handleDispatch("READY", (event) =>
      Effect.log(`Connected to Discord as ${event.user.username}#${event.user.discriminator}`)
    )

    yield* Effect.forkScoped(logReady)
  })
).pipe(Layer.provide(DiscordGatewayBase))

// Handler dependencies - ClaudeProcess, StreamingBridge, SessionContinuity, ProjectRegistry, AppConfig
const HandlerDependencies = Layer.mergeAll(
  ClaudeProcess.Default,
  StreamingBridge.Default,
  SessionContinuity.Default,
  ProjectRegistry.Default,
  AppConfigLive
).pipe(
  // BunContext.layer provides CommandExecutor and other platform services
  Layer.provide(BunContext.layer)
)

// Message handler layer - handles @mentions with streaming Claude responses
const MessageHandlerLayer = StreamingMessageHandlerLive.pipe(
  Layer.provide(DiscordGatewayBase),
  Layer.provide(DiscordRestLayer),
  Layer.provide(HandlerDependencies),
  // FileSystem for creating project directories
  Layer.provide(BunContext.layer)
)

// Slash command layers
const ProjectCommandsLayer = ProjectCommandsLive.pipe(
  Layer.provide(DiscordGatewayBase),
  Layer.provide(DiscordRestLayer),
  Layer.provide(HandlerDependencies),
  Layer.provide(BunContext.layer)
)

const SessionCommandsLayer = SessionCommandsLive.pipe(
  Layer.provide(DiscordGatewayBase),
  Layer.provide(HandlerDependencies)
)

const AskCommandLayer = AskCommandLive.pipe(
  Layer.provide(DiscordGatewayBase),
  Layer.provide(DiscordRestLayer),
  Layer.provide(HandlerDependencies)
)

const ToolsCommandLayer = ToolsCommandLive.pipe(
  Layer.provide(DiscordGatewayBase),
  Layer.provide(HandlerDependencies)
)

// Question handler layer - handles button clicks for interactive Claude responses
const QuestionHandlerLayer = QuestionHandlerLive.pipe(
  Layer.provide(DiscordGatewayBase),
  Layer.provide(DiscordRestLayer),
  Layer.provide(HandlerDependencies)
)

// Full gateway layer with REST, application, connection logging, handlers, and commands
export const DiscordGatewayLayer = Layer.mergeAll(
  DiscordGatewayBase,
  DiscordApplication.Default,
  ConnectionLoggerLive,
  MessageHandlerLayer,
  QuestionHandlerLayer,
  ProjectCommandsLayer,
  SessionCommandsLayer,
  AskCommandLayer,
  ToolsCommandLayer
)
