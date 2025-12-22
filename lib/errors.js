/**
 * Custom error classes for the DI container.
 * These provide actionable error messages with fix suggestions.
 */

/**
 * Base class for all DI-related errors.
 */
export class DIError extends Error {
  /**
   * @param {string} message
   * @param {object} [context]
   */
  constructor(message, context = {}) {
    super(message)
    this.name = "DIError"
    this.context = context
  }
}

/**
 * Thrown when a circular dependency is detected.
 */
export class CircularDependencyError extends DIError {
  /**
   * @param {Array<{ displayName?: string, name?: string }>} chain - The factories in the circular chain
   * @param {object} [context]
   */
  constructor(chain, context = {}) {
    const names = chain.map((f) => f.displayName || f.name || "anonymous")
    const chainStr = names.join(" -> ")

    const message = [
      `Circular dependency detected: ${chainStr}`,
      "",
      "Resolution chain:",
      ...names.map((name, i) => `  ${i + 1}. ${name}`),
      "",
      "How to fix:",
      "  1. Use lazy() to defer resolution:",
      `     const ${names[0]} = factory("${names[0]}", (c) => new ${names[0]}(lazy(c, ${names[1]})))`,
      "",
      "  2. Restructure dependencies to break the cycle",
      "",
      "  3. Consider if both services really need each other",
    ].join("\n")

    super(message, { chain, ...context })
    this.name = "CircularDependencyError"
    this.chain = chain
  }
}

/**
 * Thrown when a factory fails to resolve.
 */
export class ResolutionError extends DIError {
  /**
   * @param {{ displayName?: string, name?: string }} factory
   * @param {Error} cause
   * @param {Record<string, unknown> & { stack?: Array<{ displayName?: string, name?: string }> }} [context]
   */
  constructor(factory, cause, context = {}) {
    const name = factory.displayName || factory.name || "anonymous"

    const lines = [`Failed to resolve factory '${name}'`, "", `Cause: ${cause.message}`]

    if (context.stack && context.stack.length > 0) {
      lines.push(
        "",
        "Resolution stack:",
        ...context.stack.map(
          (/** @type {{ displayName?: string, name?: string }} */ f, /** @type {number} */ i) =>
            `  ${i + 1}. ${f.displayName || f.name || "anonymous"}`
        )
      )
    }

    const message = lines.join("\n")

    super(message, { factory, cause, ...context })
    this.name = "ResolutionError"
    this.factory = factory
    this.cause = cause
  }
}

/**
 * Thrown when a factory times out.
 */
export class TimeoutError extends DIError {
  /**
   * @param {{ displayName?: string, name?: string }} factory
   * @param {number} ms
   * @param {object} [context]
   */
  constructor(factory, ms, context = {}) {
    const name = factory.displayName || factory.name || "anonymous"

    const message = [
      `Factory '${name}' timed out after ${ms}ms`,
      "",
      "Possible causes:",
      "  - Network request taking too long",
      "  - Database connection timeout",
      "  - Infinite loop in factory",
      "",
      "How to fix:",
      `  1. Increase timeout: factory("${name}", fn, { timeout: ${ms * 2} })`,
      "  2. Add connection pooling or caching",
      "  3. Use lazy() to defer resolution",
    ].join("\n")

    super(message, { factory, ms, ...context })
    this.name = "TimeoutError"
    this.factory = factory
    this.ms = ms
  }
}

/**
 * Thrown when trying to resolve a new factory on a frozen container.
 */
export class FrozenContainerError extends DIError {
  /**
   * @param {{ displayName?: string, name?: string }} factory
   * @param {object} [context]
   */
  constructor(factory, context = {}) {
    const name = factory.displayName || factory.name || "anonymous"

    const message = [
      `Container is frozen. Factory '${name}' was not resolved during initialization.`,
      "",
      "The container was frozen to prevent runtime dependency issues.",
      "",
      "How to fix:",
      `  1. Resolve this factory before calling freeze():`,
      `     container.get(${name})`,
      "     container.freeze()",
      "",
      "  2. Use validate() to ensure all factories are resolved:",
      `     await container.validate([${name}, ...otherFactories])`,
      "     container.freeze()",
    ].join("\n")

    super(message, { factory, ...context })
    this.name = "FrozenContainerError"
    this.factory = factory
  }
}
