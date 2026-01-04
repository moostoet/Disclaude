import { Config, Context, Effect, Layer, Redacted } from "effect"

export interface AppConfigShape {
  readonly discordBotToken: Redacted.Redacted<string>
  readonly discordApplicationId: string
  readonly projectsBasePath: string
  readonly claudeAllowedTools: ReadonlyArray<string>
}

export class AppConfig extends Context.Tag("AppConfig")<
  AppConfig,
  AppConfigShape
>() {}

const config = Config.all({
  discordBotToken: Config.redacted("DISCORD_BOT_TOKEN"),
  discordApplicationId: Config.string("DISCORD_APPLICATION_ID"),
  projectsBasePath: Config.string("PROJECTS_BASE_PATH").pipe(
    Config.withDefault("~/projects")
  ),
  claudeAllowedTools: Config.string("CLAUDE_ALLOWED_TOOLS").pipe(
    Config.map((s) => s.split(",").map((t) => t.trim()).filter((t) => t.length > 0)),
    Config.withDefault([])
  )
})

export const AppConfigLive = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const cfg = yield* config
    return {
      discordBotToken: cfg.discordBotToken,
      discordApplicationId: cfg.discordApplicationId,
      projectsBasePath: cfg.projectsBasePath,
      claudeAllowedTools: cfg.claudeAllowedTools
    }
  })
)
