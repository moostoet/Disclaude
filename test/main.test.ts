import { describe, it, expect } from "@effect/vitest"
import { Layer } from "effect"
import { MainLive } from "../src/main.ts"

describe("Main", () => {
  it("exports MainLive layer", () => {
    expect(MainLive).toBeDefined()
    expect(Layer.isLayer(MainLive)).toBe(true)
  })
})
