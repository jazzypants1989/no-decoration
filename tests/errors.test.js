import { describe, it } from "node:test"
import assert from "node:assert"
import {
  DIError,
  CircularDependencyError,
  ResolutionError,
  TimeoutError,
  FrozenContainerError,
} from "../lib/errors.js"

describe("DIError", () => {
  it("is an Error subclass", () => {
    const error = new DIError("test message")
    assert.ok(error instanceof Error)
    assert.ok(error instanceof DIError)
  })

  it("stores context", () => {
    const error = new DIError("test", { key: "value" })
    assert.deepStrictEqual(error.context, { key: "value" })
  })

  it("has the correct name", () => {
    const error = new DIError("test")
    assert.strictEqual(error.name, "DIError")
  })
})

describe("CircularDependencyError", () => {
  it("formats the circular chain in the message", () => {
    const chain = [
      { displayName: "ServiceA" },
      { displayName: "ServiceB" },
      { displayName: "ServiceA" },
    ]

    const error = new CircularDependencyError(chain)

    assert.ok(error.message.includes("ServiceA -> ServiceB -> ServiceA"))
    assert.ok(error.message.includes("Circular dependency detected"))
  })

  it("includes resolution chain in message", () => {
    const chain = [{ displayName: "A" }, { displayName: "B" }]
    const error = new CircularDependencyError(chain)

    assert.ok(error.message.includes("1. A"))
    assert.ok(error.message.includes("2. B"))
  })

  it("includes fix suggestions", () => {
    const chain = [{ displayName: "A" }, { displayName: "B" }]
    const error = new CircularDependencyError(chain)

    assert.ok(error.message.includes("How to fix"))
    assert.ok(error.message.includes("lazy()"))
  })

  it("handles anonymous factories", () => {
    const chain = [{}, { name: "Named" }]
    const error = new CircularDependencyError(chain)

    assert.ok(error.message.includes("anonymous"))
    assert.ok(error.message.includes("Named"))
  })

  it("stores the chain", () => {
    const chain = [{ displayName: "A" }, { displayName: "B" }]
    const error = new CircularDependencyError(chain)

    assert.deepStrictEqual(error.chain, chain)
  })

  it("has the correct name", () => {
    const error = new CircularDependencyError([])
    assert.strictEqual(error.name, "CircularDependencyError")
  })
})

describe("ResolutionError", () => {
  it("includes factory name and cause in message", () => {
    const factory = { displayName: "MyService" }
    const cause = new Error("Connection failed")

    const error = new ResolutionError(factory, cause)

    assert.ok(error.message.includes("MyService"))
    assert.ok(error.message.includes("Connection failed"))
  })

  it("includes resolution stack when provided", () => {
    const factory = { displayName: "Current" }
    const cause = new Error("Failed")
    const stack = [{ displayName: "Parent" }, { displayName: "Child" }]

    const error = new ResolutionError(factory, cause, { stack })

    assert.ok(error.message.includes("Resolution stack"))
    assert.ok(error.message.includes("1. Parent"))
    assert.ok(error.message.includes("2. Child"))
  })

  it("handles anonymous factories in stack", () => {
    const factory = { displayName: "Current" }
    const cause = new Error("Failed")
    const stack = [{}, { name: "Named" }]

    const error = new ResolutionError(factory, cause, { stack })

    assert.ok(error.message.includes("anonymous"))
  })

  it("stores factory and cause", () => {
    const factory = { displayName: "Test" }
    const cause = new Error("Original")

    const error = new ResolutionError(factory, cause)

    assert.strictEqual(error.factory, factory)
    assert.strictEqual(error.cause, cause)
  })

  it("has the correct name", () => {
    const error = new ResolutionError({}, new Error())
    assert.strictEqual(error.name, "ResolutionError")
  })
})

describe("TimeoutError", () => {
  it("includes factory name and timeout in message", () => {
    const factory = { displayName: "SlowService" }
    const error = new TimeoutError(factory, 5000)

    assert.ok(error.message.includes("SlowService"))
    assert.ok(error.message.includes("5000ms"))
  })

  it("includes possible causes", () => {
    const error = new TimeoutError({ displayName: "Test" }, 1000)

    assert.ok(error.message.includes("Possible causes"))
    assert.ok(error.message.includes("Network request"))
    assert.ok(error.message.includes("Database connection"))
  })

  it("suggests increasing timeout", () => {
    const error = new TimeoutError({ displayName: "Test" }, 1000)

    assert.ok(error.message.includes("How to fix"))
    assert.ok(error.message.includes("2000")) // Suggests doubling
  })

  it("stores factory and ms", () => {
    const factory = { displayName: "Test" }
    const error = new TimeoutError(factory, 3000)

    assert.strictEqual(error.factory, factory)
    assert.strictEqual(error.ms, 3000)
  })

  it("has the correct name", () => {
    const error = new TimeoutError({}, 1000)
    assert.strictEqual(error.name, "TimeoutError")
  })
})

describe("FrozenContainerError", () => {
  it("includes factory name in message", () => {
    const factory = { displayName: "LateService" }
    const error = new FrozenContainerError(factory)

    assert.ok(error.message.includes("LateService"))
    assert.ok(error.message.includes("frozen"))
  })

  it("explains why it happened", () => {
    const error = new FrozenContainerError({ displayName: "Test" })

    assert.ok(error.message.includes("not resolved during initialization"))
  })

  it("includes fix suggestions", () => {
    const error = new FrozenContainerError({ displayName: "Test" })

    assert.ok(error.message.includes("How to fix"))
    assert.ok(error.message.includes("freeze()"))
    assert.ok(error.message.includes("validate()"))
  })

  it("stores factory", () => {
    const factory = { displayName: "Test" }
    const error = new FrozenContainerError(factory)

    assert.strictEqual(error.factory, factory)
  })

  it("has the correct name", () => {
    const error = new FrozenContainerError({})
    assert.strictEqual(error.name, "FrozenContainerError")
  })
})
