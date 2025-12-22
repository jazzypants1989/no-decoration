/**
 * Circuit Breaker Plugin - Type Declarations
 *
 * Provides a circuit breaker pattern for failing fast when dependencies are down.
 * Prevents cascading failures by cutting off failing factories.
 */

import type { Container, Factory, Plugin } from "../core.js"

// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT STATE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Circuit breaker states.
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing fast, throws without calling factory
 * - HALF_OPEN: Testing recovery, allows limited requests
 */
export type CircuitStateValue = "CLOSED" | "OPEN" | "HALF_OPEN"

/**
 * Circuit state constants for comparisons.
 *
 * @example
 * ```ts
 * import { CircuitState } from 'no-decoration/plugins/circuit-breaker'
 *
 * if (circuit.getState() === CircuitState.OPEN) {
 *   console.log('Circuit is open!')
 * }
 * ```
 */
export declare const CircuitState: {
  readonly CLOSED: "CLOSED"
  readonly OPEN: "OPEN"
  readonly HALF_OPEN: "HALF_OPEN"
}

export type CircuitState = typeof CircuitState

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for configuring a circuit breaker.
 */
export interface CircuitBreakerOptions {
  /**
   * Number of consecutive failures before the circuit opens.
   * @default 5
   */
  failureThreshold?: number

  /**
   * Time in ms to wait before attempting recovery (HALF_OPEN state).
   * @default 30000
   */
  resetTimeoutMs?: number

  /**
   * Number of consecutive successes in HALF_OPEN before closing.
   * @default 2
   */
  successThreshold?: number

  /**
   * Callback when circuit state changes.
   *
   * @example
   * ```ts
   * circuitBreaker("db", {
   *   onStateChange: (name, from, to) => {
   *     console.log(`Circuit ${name}: ${from} → ${to}`)
   *   }
   * })
   * ```
   */
  onStateChange?: (
    name: string,
    oldState: CircuitStateValue,
    newState: CircuitStateValue
  ) => void
}

// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT INFO TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Information about a circuit breaker instance.
 * Returned by getCircuit() for introspection.
 */
export interface CircuitInfo {
  /** The circuit's name */
  name: string

  /** Get the current state */
  getState(): CircuitStateValue

  /** Get the current failure count */
  getFailures(): number

  /** Get the current success count (relevant in HALF_OPEN) */
  getSuccesses(): number

  /** Get the last error that caused a failure */
  getLastError(): Error | null

  /** Reset the circuit to CLOSED state */
  reset(): void
}

/**
 * Health status for a single circuit.
 */
export interface CircuitHealthStatus {
  name: string
  state: CircuitStateValue
  failures: number
  lastError: Error | null
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when a circuit is OPEN and a resolution is attempted.
 *
 * @example
 * ```ts
 * try {
 *   await container.get(protectedService)
 * } catch (e) {
 *   if (e instanceof CircuitOpenError) {
 *     console.log(`Circuit ${e.circuitName} is open after ${e.failures} failures`)
 *   }
 * }
 * ```
 */
export declare class CircuitOpenError extends Error {
  name: "CircuitOpenError"
  circuitName: string
  failures: number
  constructor(name: string, failures: number)
}

// ═══════════════════════════════════════════════════════════════════════════
// DECORATOR FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a circuit breaker decorator for a factory.
 * The circuit tracks failures and trips open after reaching the threshold.
 *
 * Use with the patterns.pipe() function or apply directly.
 *
 * @param name - Unique name for this circuit (used in errors and introspection)
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * import { pipe } from 'no-decoration/plugins/patterns'
 * import { circuitBreaker } from 'no-decoration/plugins/circuit-breaker'
 *
 * const database = pipe(
 *   factory("Database", async () => connectToDb()),
 *   circuitBreaker("db", { failureThreshold: 3 })
 * )
 *
 * // Or apply directly:
 * const protectedDb = circuitBreaker("db")(dbFactory)
 * ```
 *
 * @example
 * ```ts
 * // State transitions
 * // CLOSED → (5 failures) → OPEN → (30s wait) → HALF_OPEN → (2 successes) → CLOSED
 * //                                                     ↓
 * //                                              (1 failure) → OPEN
 * ```
 */
export declare function circuitBreaker(
  name: string,
  options?: CircuitBreakerOptions
): <T>(factory: Factory<T | Promise<T>>) => Factory<Promise<T>>

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Methods added to the container by the circuit breaker plugin.
 */
export interface CircuitBreakerMethods {
  /**
   * Get a circuit by name.
   *
   * @example
   * ```ts
   * const dbCircuit = container.getCircuit("db")
   * if (dbCircuit?.getState() === CircuitState.OPEN) {
   *   console.log("DB circuit is open!")
   * }
   * ```
   */
  getCircuit(name: string): CircuitInfo | null

  /**
   * Get all registered circuits.
   *
   * @example
   * ```ts
   * for (const [name, circuit] of container.getAllCircuits()) {
   *   console.log(`${name}: ${circuit.getState()}`)
   * }
   * ```
   */
  getAllCircuits(): Map<string, CircuitInfo>

  /**
   * Get health status for all circuits.
   *
   * @example
   * ```ts
   * const health = container.getCircuitHealth()
   * for (const [name, status] of health) {
   *   if (status.state === CircuitState.OPEN) {
   *     console.error(`${name} is down: ${status.lastError?.message}`)
   *   }
   * }
   * ```
   */
  getCircuitHealth(): Map<string, CircuitHealthStatus>

  /**
   * Reset all circuits to CLOSED state.
   * Useful for testing or manual recovery.
   *
   * @example
   * ```ts
   * container.resetAllCircuits()
   * ```
   */
  resetAllCircuits(): void

  /**
   * Clear the circuit registry.
   * Useful for testing to ensure clean state between tests.
   */
  clearCircuitRegistry(): void
}

/**
 * Circuit breaker plugin for container introspection.
 * Add this to your container to access circuit breaker information.
 *
 * Note: The circuitBreaker() decorator works without this plugin,
 * but the plugin provides introspection methods.
 *
 * @example
 * ```ts
 * import { createContainer } from 'no-decoration/core'
 * import { circuitBreakerPlugin, circuitBreaker } from 'no-decoration/plugins/circuit-breaker'
 *
 * const container = createContainer().with(circuitBreakerPlugin)
 *
 * // Now you can introspect circuits
 * const health = container.getCircuitHealth()
 * ```
 */
export declare const circuitBreakerPlugin: Plugin<CircuitBreakerMethods>
