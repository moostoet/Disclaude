// Claude module - bridges Discord to Claude Code CLI
export {
  ClaudeResponse,
  ClaudeUsage,
  ClaudeModelUsage,
  ClaudeError,
  ClaudeStreamEvent
} from "./Schema.ts"
export {
  ClaudeProcess,
  ClaudeProcessError,
  buildClaudeArgs,
  type ClaudeExecuteOptions
} from "./ClaudeProcess.ts"
export { SessionContinuity } from "./SessionContinuity.ts"
export {
  StreamingBridge,
  StreamingBridgeError,
  buildStreamingArgs,
  parseStreamLine,
  createStreamBuffer,
  updateBuffer,
  calculateUpdateInterval,
  type ClaudeStreamOptions,
  type StreamBuffer,
  type StreamResult,
  type StreamUpdateCallback,
  type ParsedStreamEvent
} from "./StreamingBridge.ts"
