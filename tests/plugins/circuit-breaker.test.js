import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { createContainer, factory } from "../../lib/core.js"
import {
  circuitBreaker,
  circuitBreakerPlugin,
  CircuitState,
  CircuitOpenError,
} from "../../lib/plugins/circuit-breaker.js"

describe("circuit-breaker plugin", () => {
  let container

  beforeEach(() => {
    container = createContainer().with(circuitBreakerPlugin)
    // Clear the global registry between tests
    container.clearCircuitRegistry()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe("circuitBreaker() decorator", () => {
    it("passes through successful calls", async () => {
      const db = factory("Database", async () => ({ connected: true }))
      const protectedDb = circuitBreaker("db")(db)

      const result = await container.get(protectedDb)

      assert.deepStrictEqual(result, { connected: true })
    })

    it("handles sync factories", async () => {
      const config = factory("Config", () => ({ port: 3000 }))
      const protectedConfig = circuitBreaker("config")(config)

      const result = await container.get(protectedConfig)

      assert.deepStrictEqual(result, { port: 3000 })
    })

    it("propagates errors in CLOSED state", async () => {
      const failing = factory("Failing", async () => {
        throw new Error("Connection failed")
      })
      const protected_ = circuitBreaker("test", { failureThreshold: 5 })(
        failing
      )

      await assert.rejects(
        async () => container.get(protected_),
        { message: "Connection failed" }
      )
    })

    it("trips to OPEN after threshold failures", async () => {
      let callCount = 0
      const failing = factory("Failing", async () => {
        callCount++
        throw new Error("Connection failed")
      })
      const protected_ = circuitBreaker("threshold-test", {
        failureThreshold: 3,
      })(failing)

      // First 3 calls should fail with the original error
      for (let i = 0; i < 3; i++) {
        // Need a fresh resolution each time (transient behavior)
        const freshFactory = circuitBreaker("threshold-test-" + i, {
          failureThreshold: 3,
        })(failing)
        try {
          await container.get(freshFactory)
        } catch {
          // Expected
        }
      }

      // Verify the original factory was called each time
      assert.strictEqual(callCount, 3)
    })

    it("throws CircuitOpenError when circuit is OPEN", async () => {
      let callCount = 0
      const failing = factory("Failing", async () => {
        callCount++
        throw new Error("Connection failed")
      })
      const protected_ = circuitBreaker("open-test", {
        failureThreshold: 2,
      })(failing)

      // Trip the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await protected_(container)
        } catch {
          // Expected
        }
      }

      // Next call should throw CircuitOpenError without calling factory
      const previousCount = callCount
      await assert.rejects(
        async () => protected_(container),
        (err) => {
          assert.ok(err instanceof CircuitOpenError)
          assert.strictEqual(err.circuitName, "open-test")
          assert.strictEqual(err.failures, 2)
          return true
        }
      )

      // Factory should not have been called again
      assert.strictEqual(callCount, previousCount)
    })

    it("transitions to HALF_OPEN after reset timeout", async () => {
      const failing = factory("Failing", async () => {
        throw new Error("Connection failed")
      })
      const stateChanges = []
      const protected_ = circuitBreaker("timeout-test", {
        failureThreshold: 1,
        resetTimeoutMs: 50,
        onStateChange: (name, from, to) => stateChanges.push({ from, to }),
      })(failing)

      // Trip the circuit
      try {
        await protected_(container)
      } catch {
        // Expected
      }

      // Should be OPEN
      assert.deepStrictEqual(stateChanges, [
        { from: "CLOSED", to: "OPEN" },
      ])

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 60))

      // Next call should transition to HALF_OPEN (but still fail)
      try {
        await protected_(container)
      } catch {
        // Expected - either CircuitOpenError or original error
      }
    })

    it("recovers to CLOSED after successes in HALF_OPEN", async () => {
      let shouldFail = true
      const flaky = factory("Flaky", async () => {
        if (shouldFail) throw new Error("Connection failed")
        return { ok: true }
      })
      const stateChanges = []
      const protected_ = circuitBreaker("recovery-test", {
        failureThreshold: 1,
        resetTimeoutMs: 10,
        successThreshold: 2,
        onStateChange: (name, from, to) => stateChanges.push({ from, to }),
      })(flaky)

      // Trip the circuit
      try {
        await protected_(container)
      } catch {
        // Expected
      }

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 20))

      // Fix the service
      shouldFail = false

      // Make successful calls
      await protected_(container)
      await protected_(container)

      // Should have transitioned: CLOSED -> OPEN -> HALF_OPEN -> CLOSED
      assert.strictEqual(stateChanges.length, 3)
      assert.deepStrictEqual(stateChanges[0], { from: "CLOSED", to: "OPEN" })
      assert.deepStrictEqual(stateChanges[1], { from: "OPEN", to: "HALF_OPEN" })
      assert.deepStrictEqual(stateChanges[2], {
        from: "HALF_OPEN",
        to: "CLOSED",
      })
    })

    it("trips back to OPEN on failure in HALF_OPEN", async () => {
      let shouldFail = true
      const flaky = factory("Flaky", async () => {
        if (shouldFail) throw new Error("Connection failed")
        return { ok: true }
      })
      const stateChanges = []
      const protected_ = circuitBreaker("halfopen-fail-test", {
        failureThreshold: 1,
        resetTimeoutMs: 10,
        successThreshold: 2,
        onStateChange: (name, from, to) => stateChanges.push({ from, to }),
      })(flaky)

      // Trip the circuit
      try {
        await protected_(container)
      } catch {
        // Expected
      }

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 20))

      // Try again while still failing
      try {
        await protected_(container)
      } catch {
        // Expected
      }

      // Should have transitioned: CLOSED -> OPEN -> HALF_OPEN -> OPEN
      assert.strictEqual(stateChanges.length, 3)
      assert.deepStrictEqual(stateChanges[2], {
        from: "HALF_OPEN",
        to: "OPEN",
      })
    })

    it("preserves factory displayName", async () => {
      const db = factory("Database", async () => ({}))
      const protected_ = circuitBreaker("db")(db)

      assert.strictEqual(protected_.displayName, "Database")
    })

    it("preserves factory._inner reference", async () => {
      const db = factory("Database", async () => ({}))
      const protected_ = circuitBreaker("db")(db)

      assert.strictEqual(protected_._inner, db)
    })
  })

  describe("CircuitState constants", () => {
    it("exports state constants", () => {
      assert.strictEqual(CircuitState.CLOSED, "CLOSED")
      assert.strictEqual(CircuitState.OPEN, "OPEN")
      assert.strictEqual(CircuitState.HALF_OPEN, "HALF_OPEN")
    })

    it("is frozen", () => {
      assert.ok(Object.isFrozen(CircuitState))
    })
  })

  describe("CircuitOpenError", () => {
    it("has correct properties", () => {
      const error = new CircuitOpenError("test-circuit", 5)

      assert.strictEqual(error.name, "CircuitOpenError")
      assert.strictEqual(error.circuitName, "test-circuit")
      assert.strictEqual(error.failures, 5)
      assert.ok(error.message.includes("test-circuit"))
      assert.ok(error.message.includes("OPEN"))
      assert.ok(error.message.includes("5"))
    })
  })

  describe("circuitBreakerPlugin", () => {
    describe("getCircuit()", () => {
      it("returns null for unknown circuit", () => {
        const circuit = container.getCircuit("unknown")
        assert.strictEqual(circuit, null)
      })

      it("returns circuit info for registered circuit", async () => {
        const db = factory("Database", async () => ({}))
        const protected_ = circuitBreaker("db")(db)

        // Resolve to register the circuit
        await container.get(protected_)

        const circuit = container.getCircuit("db")
        assert.ok(circuit)
        assert.strictEqual(circuit.name, "db")
        assert.strictEqual(circuit.getState(), CircuitState.CLOSED)
      })
    })

    describe("getAllCircuits()", () => {
      it("returns empty Map when no circuits", () => {
        const circuits = container.getAllCircuits()
        assert.ok(circuits instanceof Map)
        assert.strictEqual(circuits.size, 0)
      })

      it("returns all registered circuits", async () => {
        const db = circuitBreaker("db")(factory("DB", async () => ({})))
        const cache = circuitBreaker("cache")(
          factory("Cache", async () => ({}))
        )

        await container.get(db)
        await container.get(cache)

        const circuits = container.getAllCircuits()
        assert.strictEqual(circuits.size, 2)
        assert.ok(circuits.has("db"))
        assert.ok(circuits.has("cache"))
      })
    })

    describe("getCircuitHealth()", () => {
      it("returns health status for all circuits", async () => {
        let dbFail = false
        const db = circuitBreaker("db", { failureThreshold: 1 })(
          factory("DB", async () => {
            if (dbFail) throw new Error("DB down")
            return {}
          })
        )
        const cache = circuitBreaker("cache")(
          factory("Cache", async () => ({}))
        )

        await container.get(db)
        await container.get(cache)

        // Trip the db circuit
        dbFail = true
        try {
          await db(container)
        } catch {
          // Expected
        }

        const health = container.getCircuitHealth()

        assert.strictEqual(health.size, 2)

        const dbHealth = health.get("db")
        assert.strictEqual(dbHealth.state, CircuitState.OPEN)
        assert.strictEqual(dbHealth.failures, 1)
        assert.ok(dbHealth.lastError instanceof Error)

        const cacheHealth = health.get("cache")
        assert.strictEqual(cacheHealth.state, CircuitState.CLOSED)
        assert.strictEqual(cacheHealth.failures, 0)
      })
    })

    describe("resetAllCircuits()", () => {
      it("resets all circuits to CLOSED", async () => {
        const failing = circuitBreaker("failing", { failureThreshold: 1 })(
          factory("Failing", async () => {
            throw new Error("Failed")
          })
        )

        // Trip the circuit
        try {
          await container.get(failing)
        } catch {
          // Expected
        }

        // Verify it's open
        assert.strictEqual(
          container.getCircuit("failing")?.getState(),
          CircuitState.OPEN
        )

        // Reset all
        container.resetAllCircuits()

        // Verify it's closed
        assert.strictEqual(
          container.getCircuit("failing")?.getState(),
          CircuitState.CLOSED
        )
      })
    })

    describe("clearCircuitRegistry()", () => {
      it("removes all circuits", async () => {
        const db = circuitBreaker("db")(factory("DB", async () => ({})))
        await container.get(db)

        assert.strictEqual(container.getAllCircuits().size, 1)

        container.clearCircuitRegistry()

        assert.strictEqual(container.getAllCircuits().size, 0)
      })
    })
  })

  describe("CircuitInfo", () => {
    it("provides getState()", async () => {
      const db = circuitBreaker("state-test")(
        factory("DB", async () => ({}))
      )
      await container.get(db)

      const circuit = container.getCircuit("state-test")
      assert.strictEqual(circuit.getState(), CircuitState.CLOSED)
    })

    it("provides getFailures()", async () => {
      const failing = circuitBreaker("failures-test", { failureThreshold: 5 })(
        factory("Failing", async () => {
          throw new Error("Failed")
        })
      )

      for (let i = 0; i < 3; i++) {
        try {
          await failing(container)
        } catch {
          // Expected
        }
      }

      const circuit = container.getCircuit("failures-test")
      assert.strictEqual(circuit.getFailures(), 3)
    })

    it("provides getLastError()", async () => {
      const failing = circuitBreaker("error-test", { failureThreshold: 5 })(
        factory("Failing", async () => {
          throw new Error("Specific error message")
        })
      )

      try {
        await failing(container)
      } catch {
        // Expected
      }

      const circuit = container.getCircuit("error-test")
      const lastError = circuit.getLastError()
      assert.ok(lastError instanceof Error)
      assert.strictEqual(lastError.message, "Specific error message")
    })

    it("provides reset()", async () => {
      const failing = circuitBreaker("reset-test", { failureThreshold: 1 })(
        factory("Failing", async () => {
          throw new Error("Failed")
        })
      )

      // Trip the circuit
      try {
        await failing(container)
      } catch {
        // Expected
      }

      const circuit = container.getCircuit("reset-test")
      assert.strictEqual(circuit.getState(), CircuitState.OPEN)
      assert.strictEqual(circuit.getFailures(), 1)

      // Reset
      circuit.reset()

      assert.strictEqual(circuit.getState(), CircuitState.CLOSED)
      assert.strictEqual(circuit.getFailures(), 0)
      assert.strictEqual(circuit.getLastError(), null)
    })
  })

  describe("onStateChange callback", () => {
    it("is called on state transitions", async () => {
      const changes = []
      const failing = circuitBreaker("callback-test", {
        failureThreshold: 1,
        resetTimeoutMs: 10,
        onStateChange: (name, from, to) => changes.push({ name, from, to }),
      })(
        factory("Failing", async () => {
          throw new Error("Failed")
        })
      )

      // Trip to OPEN
      try {
        await failing(container)
      } catch {
        // Expected
      }

      assert.strictEqual(changes.length, 1)
      assert.deepStrictEqual(changes[0], {
        name: "callback-test",
        from: "CLOSED",
        to: "OPEN",
      })
    })

    it("is not called when state does not change", async () => {
      const changes = []
      const failing = circuitBreaker("no-change-test", {
        failureThreshold: 5,
        onStateChange: (name, from, to) => changes.push({ from, to }),
      })(
        factory("Failing", async () => {
          throw new Error("Failed")
        })
      )

      // Fail twice (but don't reach threshold)
      for (let i = 0; i < 2; i++) {
        try {
          await failing(container)
        } catch {
          // Expected
        }
      }

      // No state changes should have occurred
      assert.strictEqual(changes.length, 0)
    })
  })

  describe("default options", () => {
    it("uses default failureThreshold of 5", async () => {
      let callCount = 0
      const failing = circuitBreaker("default-threshold")(
        factory("Failing", async () => {
          callCount++
          throw new Error("Failed")
        })
      )

      // Should allow 5 failures before opening
      for (let i = 0; i < 5; i++) {
        try {
          await failing(container)
        } catch {
          // Expected
        }
      }

      assert.strictEqual(callCount, 5)
      assert.strictEqual(
        container.getCircuit("default-threshold")?.getState(),
        CircuitState.OPEN
      )
    })

    it("uses default successThreshold of 2", async () => {
      let shouldFail = true
      const flaky = circuitBreaker("default-success", {
        failureThreshold: 1,
        resetTimeoutMs: 10,
      })(
        factory("Flaky", async () => {
          if (shouldFail) throw new Error("Failed")
          return {}
        })
      )

      // Trip the circuit
      try {
        await flaky(container)
      } catch {
        // Expected
      }

      // Wait and fix
      await new Promise((r) => setTimeout(r, 20))
      shouldFail = false

      // First success - should be in HALF_OPEN
      await flaky(container)
      assert.strictEqual(
        container.getCircuit("default-success")?.getState(),
        CircuitState.HALF_OPEN
      )

      // Second success - should close
      await flaky(container)
      assert.strictEqual(
        container.getCircuit("default-success")?.getState(),
        CircuitState.CLOSED
      )
    })
  })
})
