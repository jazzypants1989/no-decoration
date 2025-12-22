import { describe, it } from "node:test"
import assert from "node:assert"
import { discover } from "../../lib/plugins/discover.js"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const examplesDir = join(__dirname, "../../examples/multifile")

describe("discover plugin", () => {
  describe("discover()", () => {
    it("finds factory() calls", async () => {
      const result = await discover([examplesDir])

      const factoryNames = result.factories.map((f) => f.name)
      assert.ok(factoryNames.includes("Config"))
      assert.ok(factoryNames.includes("Logger"))
      assert.ok(factoryNames.includes("Database"))
      assert.ok(factoryNames.includes("UserService"))
    })

    it("identifies async factories", async () => {
      const result = await discover([examplesDir])

      const database = result.factories.find((f) => f.name === "Database")
      const config = result.factories.find((f) => f.name === "Config")

      assert.strictEqual(database?.options?.async, true)
      assert.strictEqual(config?.options?.async, false)
    })

    it("sets type to factory", async () => {
      const result = await discover([examplesDir])

      const config = result.factories.find((f) => f.name === "Config")
      assert.strictEqual(config?.type, "factory")
    })

    it("includes file path", async () => {
      const result = await discover([examplesDir])

      const config = result.factories.find((f) => f.name === "Config")
      assert.ok(config?.file.includes("config.js"))
    })

    it("builds dependency graph with resolved names", async () => {
      const result = await discover([examplesDir])

      // Logger depends on Config (resolved from 'config' import)
      const loggerToConfig = result.dependencies.find(
        (d) => d.from === "Logger" && d.to === "Config"
      )
      assert.ok(loggerToConfig, "Logger should depend on Config")

      // Database depends on Logger (resolved from 'logger' import)
      const dbToLogger = result.dependencies.find(
        (d) => d.from === "Database" && d.to === "Logger"
      )
      assert.ok(dbToLogger, "Database should depend on Logger")
    })

    it("deduplicates factories by name", async () => {
      const result = await discover([examplesDir])

      const configCount = result.factories.filter(
        (f) => f.name === "Config"
      ).length
      assert.strictEqual(configCount, 1)
    })

    it("supports virtual files for testing", async () => {
      const result = await discover({
        files: {
          "a.js": `export const a = factory("A", () => 1)`,
          "b.js": `import { a } from './a.js'; export const b = factory("B", c => c.get(a))`
        }
      })

      assert.strictEqual(result.factories.length, 2)
      assert.ok(result.factories.find(f => f.name === "A"))
      assert.ok(result.factories.find(f => f.name === "B"))

      // B depends on A
      const bToA = result.dependencies.find(d => d.from === "B" && d.to === "A")
      assert.ok(bToA, "B should depend on A")
    })
  })

  describe("toMermaid()", () => {
    it("generates Mermaid diagram", async () => {
      const result = await discover([examplesDir])
      const mermaid = result.toMermaid()

      assert.ok(mermaid.startsWith("graph TD"))
      assert.ok(mermaid.includes("Logger --> Config"))
    })
  })

  describe("validate()", () => {
    it("identifies root factories", async () => {
      const result = await discover([examplesDir])
      const validation = result.validate()

      // UserService is a root - nothing depends on it
      const rootNames = validation.roots.map(f => f.name)
      assert.ok(rootNames.includes("UserService"), "UserService should be a root")
    })

    it("validates circular dependencies", async () => {
      const result = await discover({
        files: {
          "a.js": `import { b } from './b.js'; export const a = factory("A", c => c.get(b))`,
          "b.js": `import { a } from './a.js'; export const b = factory("B", c => c.get(a))`
        }
      })

      const validation = result.validate()
      assert.strictEqual(validation.valid, false)
      assert.ok(validation.circular.length > 0, "Should detect circular dependency")
    })
  })

  describe("query methods", () => {
    it("getFactory returns factory by name", async () => {
      const result = await discover([examplesDir])
      const config = result.getFactory("Config")
      assert.ok(config)
      assert.strictEqual(config.name, "Config")
    })

    it("getDependenciesOf returns dependencies", async () => {
      const result = await discover([examplesDir])
      const deps = result.getDependenciesOf("Database")
      const depNames = deps.map(d => d.name)
      assert.ok(depNames.includes("Config") || depNames.includes("Logger"))
    })

    it("getDependentsOf returns dependents", async () => {
      const result = await discover([examplesDir])
      const dependents = result.getDependentsOf("Config")
      const dependentNames = dependents.map(d => d.name)
      assert.ok(dependentNames.includes("Logger") || dependentNames.includes("Database"))
    })
  })
})
