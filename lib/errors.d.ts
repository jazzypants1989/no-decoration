/**
 * Custom error classes for the DI container.
 */

import type { Factory } from "./core"

/**
 * Base class for all DI-related errors.
 */
export class DIError extends Error {
  readonly context: Record<string, any>
  constructor(message: string, context?: Record<string, any>)
}

/**
 * Thrown when a circular dependency is detected.
 */
export class CircularDependencyError extends DIError {
  readonly chain: Factory<any>[]
  constructor(chain: Factory<any>[], context?: Record<string, any>)
}

/**
 * Thrown when a factory fails to resolve.
 */
export class ResolutionError extends DIError {
  readonly factory: Factory<any>
  readonly cause: Error
  constructor(
    factory: Factory<any>,
    cause: Error,
    context?: Record<string, any> & { stack?: Factory<any>[] }
  )
}

/**
 * Thrown when a factory times out.
 */
export class TimeoutError extends DIError {
  readonly factory: Factory<any>
  readonly ms: number
  constructor(factory: Factory<any>, ms: number, context?: Record<string, any>)
}

/**
 * Thrown when trying to resolve a new factory on a frozen container.
 */
export class FrozenContainerError extends DIError {
  readonly factory: Factory<any>
  constructor(factory: Factory<any>, context?: Record<string, any>)
}
