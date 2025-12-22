/**
 * Circuit breaker plugin for failing fast when dependencies are down.
 */

/** @import * as Types from '../core.js' */
/** @import * as CBTypes from './circuit-breaker.js' */

/** @type {CBTypes.CircuitState} */
export const CircuitState = Object.freeze({
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN",
})

export class CircuitOpenError extends Error {
  /**
   * @param {string} name
   * @param {number} failures
   */
  constructor(name, failures) {
    super(`Circuit breaker "${name}" is OPEN after ${failures} failures`)
    this.name = "CircuitOpenError"
    this.circuitName = name
    this.failures = failures
  }
}

/**
 * Registry for circuit breakers - shared across containers
 * @type {Map<string, CBTypes.CircuitInfo>}
 */
const circuitRegistry = new Map()

/**
 * @param {string} name
 * @param {CBTypes.CircuitBreakerOptions} [options]
 */
export function circuitBreaker(name, options = {}) {
  const {
    failureThreshold = 5,
    resetTimeoutMs = 30000,
    successThreshold = 2,
    onStateChange,
  } = options

  /** @type {CBTypes.CircuitStateValue} */
  let state = CircuitState.CLOSED
  let failures = 0
  let successes = 0
  let lastFailureTime = 0
  /** @type {Error | null} */
  let lastError = null

  /**
   * @param {CBTypes.CircuitStateValue} newState
   */
  const setState = (newState) => {
    if (state !== newState) {
      const oldState = state
      state = newState
      onStateChange?.(name, oldState, newState)
    }
  }

  /** @type {CBTypes.CircuitInfo} */
  const circuitInfo = {
    name,
    getState: () => state,
    getFailures: () => failures,
    getSuccesses: () => successes,
    getLastError: () => lastError,
    reset: () => {
      setState(CircuitState.CLOSED)
      failures = 0
      successes = 0
      lastError = null
    },
  }

  // Register this circuit
  circuitRegistry.set(name, circuitInfo)

  /**
   * @template T
   * @param {Types.Factory<T | Promise<T>>} factory
   */
  return (factory) => {
    /** @param {Types.Container} c */
    const wrapped = async (c) => {
      // Check if we should transition from OPEN to HALF_OPEN
      if (state === CircuitState.OPEN) {
        const timeSinceFailure = Date.now() - lastFailureTime
        if (timeSinceFailure >= resetTimeoutMs) {
          setState(CircuitState.HALF_OPEN)
          successes = 0
        } else {
          throw new CircuitOpenError(name, failures)
        }
      }

      try {
        const result = await factory(c)

        if (state === CircuitState.HALF_OPEN) {
          successes++
          if (successes >= successThreshold) {
            setState(CircuitState.CLOSED)
            failures = 0
            lastError = null
          }
        } else if (state === CircuitState.CLOSED) {
          failures = 0
          lastError = null
        }

        return result
      } catch (error) {
        lastError = /** @type {Error} */ (error)
        lastFailureTime = Date.now()
        failures++

        if (state === CircuitState.HALF_OPEN) {
          setState(CircuitState.OPEN)
        } else if (failures >= failureThreshold) {
          setState(CircuitState.OPEN)
        }

        throw error
      }
    }

    wrapped.displayName = factory.displayName || factory.name
    wrapped._inner = factory
    // @ts-ignore - attaching metadata
    wrapped._circuit = circuitInfo

    return wrapped
  }
}

/** @type {CBTypes.circuitBreakerPlugin} */
export const circuitBreakerPlugin = {
  name: "circuit-breaker",

  /**
   * @param {Types.Container} _container
   * @param {Types.ContainerInternals} _internals
   */
  apply(_container, _internals) {
    return {
      getCircuit(name) {
        return circuitRegistry.get(name) ?? null
      },

      getAllCircuits() {
        return new Map(circuitRegistry)
      },

      getCircuitHealth() {
        /** @type {Map<string, CBTypes.CircuitHealthStatus>} */
        const health = new Map()

        for (const [name, circuit] of circuitRegistry) {
          health.set(name, {
            name,
            state: circuit.getState(),
            failures: circuit.getFailures(),
            lastError: circuit.getLastError(),
          })
        }

        return health
      },

      resetAllCircuits() {
        for (const circuit of circuitRegistry.values()) {
          circuit.reset()
        }
      },

      clearCircuitRegistry() {
        circuitRegistry.clear()
      },
    }
  },
}
