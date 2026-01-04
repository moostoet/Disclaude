# Implementation Plan: Disclaude

## Goal

Build a Discord bot that bridges Discord channels/threads to Claude Code CLI sessions, enabling users to interact with Claude Code from Discord with full support for:
- Slash commands mirroring Claude Code's capabilities
- Interactive Q&A (plan mode questions, confirmations)
- Per-channel/thread project isolation
- Session persistence across Discord messages

## Current State

- **Project initialized**: Effect TypeScript with bun
- **Dependencies installed**: `effect`, `@effect/platform`, `@effect/platform-node`
- **Reference material**: Effect-TS discord-bot patterns cloned and documented
- **Claude Code CLI researched**: Non-interactive mode, JSON output, session management understood

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Discord                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  #project-a  │  │  #project-b  │  │  Thread 123  │              │
│  │  (channel)   │  │  (channel)   │  │  (thread)    │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
└─────────┼─────────────────┼─────────────────┼──────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Disclaude Bot                                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                     Discord Gateway (dfx)                       │ │
│  │  - MESSAGE_CREATE handler                                       │ │
│  │  - Slash command registry                                       │ │
│  │  - Interaction handlers (buttons, modals)                       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Session Manager                              │ │
│  │  - Maps Discord channel/thread → Claude session                 │ │
│  │  - Stores session_id, working_dir, state                        │ │
│  │  - Handles session lifecycle                                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  Claude Code Bridge                             │ │
│  │  - Spawns `claude -p` processes                                 │ │
│  │  - Parses JSON/stream-json output                               │ │
│  │  - Handles session continuity (--resume)                        │ │
│  │  - Manages permissions (--allowedTools)                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  Response Formatter                             │ │
│  │  - Splits long responses (>2000 chars)                          │ │
│  │  - Formats code blocks for Discord                              │ │
│  │  - Creates interactive buttons for questions                    │ │
│  │  - Attaches files when needed                                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Claude Code CLI                                 │
│  claude -p "prompt" --output-format json --resume <session>         │
│  Working in: /path/to/project                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Tasks

### Phase 1: Foundation

#### 1.1 Project Structure Setup (Complexity: S)
**What:** Create initial project structure with src directories
**Why:** Establish consistent organization before adding code
**Dependencies:** None
**Success criteria:** Directories exist, imports work
**Files affected:**
```
src/
  index.ts           # Entry point
  Discord/           # Discord integration layer
  Claude/            # Claude Code bridge
  Session/           # Session management
  Config/            # Configuration
```

#### 1.2 Configuration Layer (Complexity: S)
**What:** Create Effect Config layer for all configuration
**Why:** Centralize environment variables with type safety
**Dependencies:** 1.1
**Success criteria:** All config loads from env, fails gracefully
**Files affected:**
```
src/Config/index.ts
  - DISCORD_BOT_TOKEN (redacted)
  - DISCORD_APPLICATION_ID
  - CLAUDE_ALLOWED_TOOLS (optional)
  - PROJECTS_BASE_PATH (where projects live)
```

#### 1.3 Discord Gateway Layer (Complexity: M)
**What:** Set up dfx Discord connection with gateway events
**Why:** Core connectivity to Discord
**Dependencies:** 1.2
**Success criteria:** Bot connects, logs ready event
**Files affected:**
```
src/Discord/DiscordConfig.ts
src/Discord/DiscordGateway.ts
src/Discord/DiscordRest.ts
```

### Phase 2: Session Management

#### 2.1 Session Schema (Complexity: S)
**What:** Define Effect Schema for session state
**Why:** Type-safe session data with validation
**Dependencies:** 1.1
**Success criteria:** Schema compiles, encodes/decodes correctly
**Files affected:**
```
src/Session/Schema.ts
  - DiscordSession (channelId, threadId, claudeSessionId, projectPath, state)
  - SessionState enum (idle, awaiting_response, awaiting_input)
```

#### 2.2 Session Store Service (Complexity: M)
**What:** In-memory session storage with Effect Ref
**Why:** Track active sessions per channel/thread
**Dependencies:** 2.1
**Success criteria:** Create, get, update, delete sessions works
**Files affected:**
```
src/Session/SessionStore.ts
  - Effect.Service with HashMap<ChannelId, Session>
  - get(channelId): Effect<Option<Session>>
  - create(channelId, projectPath): Effect<Session>
  - update(channelId, fn): Effect<Session>
  - delete(channelId): Effect<void>
```

#### 2.3 Project Mapping (Complexity: S)
**What:** Map Discord channels to local project directories
**Why:** Each channel needs isolated Claude Code context
**Dependencies:** 2.2
**Success criteria:** Channel → project path resolution works
**Files affected:**
```
src/Session/ProjectMapping.ts
  - Convention: channel name or topic contains project path
  - Or: explicit /project command to set path
  - Default: ~/projects/<channel-name>
```

### Phase 3: Claude Code Bridge

#### 3.1 Claude Process Service (Complexity: L)
**What:** Spawn and manage Claude Code CLI processes
**Why:** Core bridge functionality
**Dependencies:** 2.2
**Success criteria:** Can execute claude -p and get JSON response
**Files affected:**
```
src/Claude/ClaudeProcess.ts
  - Effect.Service using @effect/platform Command
  - execute(prompt, options): Effect<ClaudeResponse, ClaudeError>
  - Options: sessionId, workingDir, allowedTools, outputFormat
  - Handles: stdout parsing, stderr capture, exit codes
```

#### 3.2 Claude Response Schema (Complexity: S)
**What:** Schema for Claude Code JSON output
**Why:** Type-safe response handling
**Dependencies:** 3.1
**Success criteria:** All response fields parsed correctly
**Files affected:**
```
src/Claude/Schema.ts
  - ClaudeResponse { result, session_id, usage, stop_reason, ... }
  - ClaudeStreamEvent (for stream-json mode)
  - ClaudeError { type, message }
```

#### 3.3 Session Continuity (Complexity: M)
**What:** Resume Claude sessions across Discord messages
**Why:** Maintain conversation context
**Dependencies:** 3.1, 2.2
**Success criteria:** Multi-turn conversations work
**Files affected:**
```
src/Claude/SessionContinuity.ts
  - Stores claude session_id in Discord session
  - Adds --resume flag for subsequent messages
  - Handles session expiry/recreation
```

### Phase 4: Discord Handlers

#### 4.1 Message Handler (Complexity: M)
**What:** Handle @bot mentions in messages
**Why:** Primary interaction method (like Claude Code REPL)
**Dependencies:** 3.1, 2.2
**Success criteria:** @Disclaude <prompt> triggers Claude and responds
**Files affected:**
```
src/Discord/Handlers/MessageHandler.ts
  - Filters: bot mentions, not from bots
  - Extracts prompt from message content
  - Gets/creates session for channel
  - Executes Claude, posts response
```

#### 4.2 Slash Commands (Complexity: M)
**What:** Register and handle slash commands
**Why:** Discoverability, matches Claude Code /commands
**Dependencies:** 4.1
**Success criteria:** /ask, /project, /session commands work
**Files affected:**
```
src/Discord/Commands/index.ts
src/Discord/Commands/Ask.ts        # /ask <prompt>
src/Discord/Commands/Project.ts    # /project set <path>
src/Discord/Commands/Session.ts    # /session [clear|info]
src/Discord/Commands/Tools.ts      # /tools [list|enable|disable]
```

#### 4.3 Response Formatter (Complexity: M)
**What:** Format Claude responses for Discord
**Why:** Discord has message limits, formatting differences
**Dependencies:** 4.1
**Success criteria:** Long responses split correctly, code blocks work
**Files affected:**
```
src/Discord/ResponseFormatter.ts
  - splitMessage(text, limit=2000): string[]
  - formatCodeBlocks(text): string
  - createFileAttachment(content, name): File
  - truncateWithEllipsis(text, limit): string
```

### Phase 5: Interactive Features

#### 5.1 Question Handler (Complexity: L)
**What:** Handle Claude's interactive questions via Discord buttons
**Why:** Support plan mode, confirmations, tool approvals
**Dependencies:** 4.1, 2.2
**Success criteria:** Questions appear as buttons, answers resume Claude
**Files affected:**
```
src/Discord/Handlers/QuestionHandler.ts
  - Detects question patterns in Claude output
  - Creates Discord buttons for options
  - Waits for button click
  - Resumes Claude with selected answer
```

#### 5.2 Streaming Support (Complexity: L)
**What:** Stream Claude output to Discord in real-time
**Why:** Long operations need progress feedback
**Dependencies:** 3.1, 4.1
**Success criteria:** Partial responses update in Discord
**Files affected:**
```
src/Claude/StreamingBridge.ts
  - Uses --output-format stream-json
  - Buffers partial content
  - Updates Discord message periodically (rate limited)
  - Shows typing indicator during generation
```

### Phase 6: Polish & Safety

#### 6.1 Permission System (Complexity: M)
**What:** Control which Discord users can use which features
**Why:** Security for multi-user Discord servers
**Dependencies:** 4.2
**Success criteria:** Role-based access works
**Files affected:**
```
src/Discord/Permissions.ts
  - Check user roles before execution
  - Configurable allowed roles per command
  - Rate limiting per user
```

#### 6.2 Error Handling (Complexity: M)
**What:** Comprehensive error handling and user feedback
**Why:** Graceful degradation, debugging
**Dependencies:** All above
**Success criteria:** All errors logged, user gets helpful message
**Files affected:**
```
src/Errors/index.ts
  - Tagged errors for each failure mode
  - User-friendly error messages
  - Detailed logging for debugging
```

#### 6.3 Observability (Complexity: S)
**What:** Add OpenTelemetry tracing
**Why:** Debug and monitor in production
**Dependencies:** 6.2
**Success criteria:** Traces visible in collector
**Files affected:**
```
src/Observability/Tracing.ts
  - TracerLayer for all services
  - Span attributes for debugging
  - Error recording
```

## Testing Strategy

1. **Unit tests**: Schema encoding/decoding, response formatting
2. **Integration tests**: Claude bridge with mock process
3. **E2E tests**: Full Discord → Claude → Discord flow (test server)

## Risks & Considerations

| Risk | Mitigation |
|------|------------|
| Claude CLI output format changes | Version pin, schema validation |
| Discord rate limits | Implement rate limiting, batch updates |
| Long-running Claude operations | Timeouts, streaming, progress feedback |
| Session state loss on restart | Consider persistent storage (SQLite) |
| Security: arbitrary code execution | Whitelist allowed tools, user permissions |
| Message size limits (2000 chars) | Chunking, file attachments for long output |

## Out of Scope (v1)

- Multi-machine deployment / clustering
- Database persistence (in-memory for v1)
- Voice channel integration
- Custom MCP server for Discord
- Web dashboard
- OAuth / per-user Claude API keys

## Complexity Summary

| Phase | Tasks | Total Complexity |
|-------|-------|------------------|
| 1. Foundation | 3 | S + S + M |
| 2. Session | 3 | S + M + S |
| 3. Claude Bridge | 3 | L + S + M |
| 4. Discord Handlers | 3 | M + M + M |
| 5. Interactive | 2 | L + L |
| 6. Polish | 3 | M + M + S |

**Recommended order:** Phases 1-4 for MVP, then Phase 5-6 for full feature set.
