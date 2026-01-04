// Session module - manages Discord channel to Claude session mappings
export { DiscordSession, SessionState, SessionStateSchema } from "./Schema.ts"
export { SessionStore, SessionNotFoundError } from "./SessionStore.ts"
export { ProjectMapping } from "./ProjectMapping.ts"
export { ProjectRegistry, type ProjectAssignment } from "./ProjectRegistry.ts"
