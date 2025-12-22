import { describe, it, beforeEach } from "node:test"
import assert from "node:assert"
import { createContainer } from "../../lib/core.js"
import { batch, defineFactories } from "../../lib/plugins/batch.js"

describe("batch plugin", () => {
  let container

  beforeEach(() => {
    container = createContainer()
  })

  describe("defineFactories()", () => {
    it("defines multiple named factories from an object", () => {
      const factories = defineFactories({
        config: () => ({ env: "test" }),
        logger: (c) => ({ config: c.get(factories.config) }),
      })

      assert.strictEqual(factories.config.displayName, "config")
      assert.strictEqual(factories.logger.displayName, "logger")

      const logger = container.get(factories.logger)
      assert.deepStrictEqual(logger.config, { env: "test" })
    })

    it("supports builder function for forward references", () => {
      const factories = defineFactories((f) => ({
        config: () => ({ env: "test" }),
        logger: (c) => ({ config: c.get(f.config) }),
      }))

      const logger = container.get(factories.logger)
      assert.deepStrictEqual(logger.config, { env: "test" })
    })

    it("sets displayName on all factories", () => {
      const factories = defineFactories({
        first: () => ({}),
        second: () => ({}),
      })

      assert.strictEqual(factories.first.displayName, "first")
      assert.strictEqual(factories.second.displayName, "second")
    })

    it("throws for undefined forward references", () => {
      const factories = defineFactories((f) => ({
        // Reference a factory that doesn't exist
        broken: (c) => c.get(f.nonexistent),
      }))

      assert.throws(
        () => container.get(factories.broken),
        (err) => err.message.includes("not yet defined")
      )
    })
  })

  describe("batch plugin interface", () => {
    it("can be applied via .with()", () => {
      const containerWithBatch = createContainer().with(batch)

      assert.ok(typeof containerWithBatch.defineFactories === "function")
    })

    it("defineFactories works through plugin", () => {
      const containerWithBatch = createContainer().with(batch)

      const factories = containerWithBatch.defineFactories({
        config: () => ({ env: "plugin" }),
      })

      const config = containerWithBatch.get(factories.config)
      assert.deepStrictEqual(config, { env: "plugin" })
    })
  })
})
