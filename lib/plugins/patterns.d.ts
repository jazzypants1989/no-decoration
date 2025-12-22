/**
 * Patterns Plugin - Type Declarations
 *
 * Compositional decorators for factories.
 */

import type { Container, Factory } from "../core.js"

// Re-export Factory for convenience
export type { Factory }

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A decorator transforms a factory into another factory
 */
export type FactoryDecorator<T> = (factory: Factory<T>) => Factory<T>

/**
 * Context passed to interceptors and error handlers
 */
export interface InterceptContext<T> {
  container: Container
  factory: Factory<T>
}

// ═══════════════════════════════════════════════════════════════════════════
// GUARD TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Guard function - checks access before resolution
 * - Throw to reject with custom error
 * - Return false to reject with GuardError
 * - Return true or void to allow
 */
export type GuardFn = (
  container: Container
) => void | boolean | Promise<void | boolean>

/**
 * Error thrown when a guard rejects access
 */
export declare class GuardError extends Error {
  name: "GuardError"
  factoryName?: string
  constructor(message: string, factoryName?: string)
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validator function - transforms or validates a value
 */
export type ValidatorFn<T> = (value: T) => T

/**
 * Schema with parse method (Zod, Valibot, etc.)
 */
export interface Schema<T> {
  parse(value: unknown): T
}

/**
 * Error thrown when validation fails
 */
export declare class ValidationError extends Error {
  name: "ValidationError"
  factoryName?: string
  cause?: unknown
  constructor(message: string, factoryName?: string, cause?: unknown)
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERCEPT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interceptor function - wraps factory resolution
 */
export type InterceptorFn<T> = (
  next: () => T,
  context: InterceptContext<T>
) => T

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLER TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Error handler function - handles resolution errors
 */
export type ErrorHandler<T> = (
  error: unknown,
  context: InterceptContext<T>
) => T

// ═══════════════════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compose multiple decorators onto a factory.
 * Decorators are applied left-to-right, with each decorator's output
 * type flowing to the next decorator's input.
 *
 * @example
 * ```ts
 * const userService = pipe(
 *   factory("UserService", fn),
 *   guard(requireAuth),
 *   validate(userSchema),
 *   retry(3, 100)  // Changes Factory<T> to Factory<Promise<T>>
 * )
 * ```
 */
// 1 decorator
export declare function pipe<T, R1>(
  factory: Factory<T>,
  d1: (f: Factory<T>) => Factory<R1>
): Factory<R1>

// 2 decorators
export declare function pipe<T, R1, R2>(
  factory: Factory<T>,
  d1: (f: Factory<T>) => Factory<R1>,
  d2: (f: Factory<R1>) => Factory<R2>
): Factory<R2>

// 3 decorators
export declare function pipe<T, R1, R2, R3>(
  factory: Factory<T>,
  d1: (f: Factory<T>) => Factory<R1>,
  d2: (f: Factory<R1>) => Factory<R2>,
  d3: (f: Factory<R2>) => Factory<R3>
): Factory<R3>

// 4 decorators
export declare function pipe<T, R1, R2, R3, R4>(
  factory: Factory<T>,
  d1: (f: Factory<T>) => Factory<R1>,
  d2: (f: Factory<R1>) => Factory<R2>,
  d3: (f: Factory<R2>) => Factory<R3>,
  d4: (f: Factory<R3>) => Factory<R4>
): Factory<R4>

// 5 decorators
export declare function pipe<T, R1, R2, R3, R4, R5>(
  factory: Factory<T>,
  d1: (f: Factory<T>) => Factory<R1>,
  d2: (f: Factory<R1>) => Factory<R2>,
  d3: (f: Factory<R2>) => Factory<R3>,
  d4: (f: Factory<R3>) => Factory<R4>,
  d5: (f: Factory<R4>) => Factory<R5>
): Factory<R5>

// 6 decorators
export declare function pipe<T, R1, R2, R3, R4, R5, R6>(
  factory: Factory<T>,
  d1: (f: Factory<T>) => Factory<R1>,
  d2: (f: Factory<R1>) => Factory<R2>,
  d3: (f: Factory<R2>) => Factory<R3>,
  d4: (f: Factory<R3>) => Factory<R4>,
  d5: (f: Factory<R4>) => Factory<R5>,
  d6: (f: Factory<R5>) => Factory<R6>
): Factory<R6>

// 7 decorators
export declare function pipe<T, R1, R2, R3, R4, R5, R6, R7>(
  factory: Factory<T>,
  d1: (f: Factory<T>) => Factory<R1>,
  d2: (f: Factory<R1>) => Factory<R2>,
  d3: (f: Factory<R2>) => Factory<R3>,
  d4: (f: Factory<R3>) => Factory<R4>,
  d5: (f: Factory<R4>) => Factory<R5>,
  d6: (f: Factory<R5>) => Factory<R6>,
  d7: (f: Factory<R6>) => Factory<R7>
): Factory<R7>

// 8 decorators
export declare function pipe<T, R1, R2, R3, R4, R5, R6, R7, R8>(
  factory: Factory<T>,
  d1: (f: Factory<T>) => Factory<R1>,
  d2: (f: Factory<R1>) => Factory<R2>,
  d3: (f: Factory<R2>) => Factory<R3>,
  d4: (f: Factory<R3>) => Factory<R4>,
  d5: (f: Factory<R4>) => Factory<R5>,
  d6: (f: Factory<R5>) => Factory<R6>,
  d7: (f: Factory<R6>) => Factory<R7>,
  d8: (f: Factory<R7>) => Factory<R8>
): Factory<R8>

// Fallback for 9+ decorators (loses intermediate type tracking)
export declare function pipe<T>(
  factory: Factory<T>,
  ...decorators: Array<(f: Factory<unknown>) => Factory<unknown>>
): Factory<unknown>

/**
 * Create a guard decorator for access control.
 *
 * @example
 * ```ts
 * const requireAuth = () => {
 *   if (!getCurrentUser()) throw new UnauthorizedError()
 * }
 *
 * pipe(factory("Admin", fn), guard(requireAuth))
 * ```
 */
export declare function guard(guardFn: GuardFn): <T>(factory: Factory<T>) => Factory<T>

/**
 * Create a validate decorator with a schema or function.
 *
 * @example
 * ```ts
 * // With Zod schema
 * pipe(factory("User", fn), validate(userSchema))
 *
 * // With function
 * pipe(factory("Config", fn), validate((cfg) => {
 *   if (!cfg.apiKey) throw new Error('Missing API key')
 *   return cfg
 * }))
 * ```
 */
export declare function validate<T>(schema: Schema<T>): FactoryDecorator<T>
export declare function validate<T>(fn: ValidatorFn<T>): FactoryDecorator<T>

/**
 * Create an intercept decorator for wrapping resolution.
 *
 * @example
 * ```ts
 * const timing = (next, ctx) => {
 *   const start = Date.now()
 *   const result = next()
 *   console.log(`${ctx.factory.displayName} took ${Date.now() - start}ms`)
 *   return result
 * }
 *
 * pipe(factory("Slow", fn), intercept(timing))
 * ```
 */
export declare function intercept<T>(
  interceptorFn: InterceptorFn<T>
): FactoryDecorator<T>

/**
 * Create a catchError decorator for handling errors.
 *
 * @example
 * ```ts
 * const fallback = (error, ctx) => {
 *   console.error('Failed:', error)
 *   return { fallback: true }
 * }
 *
 * pipe(factory("Flaky", fn), catchError(fallback))
 * ```
 */
export declare function catchError<T>(
  handler: ErrorHandler<T>
): FactoryDecorator<T>

/**
 * Create a tap decorator for side effects without modifying the value.
 *
 * @example
 * ```ts
 * pipe(
 *   factory("User", fn),
 *   tap((user) => console.log('Resolved user:', user))
 * )
 * ```
 */
export declare function tap<T>(
  fn: (value: T, context: InterceptContext<T>) => void
): FactoryDecorator<T>

/**
 * Create a transform decorator for mapping the resolved value.
 *
 * @example
 * ```ts
 * pipe(
 *   factory("Users", fn),
 *   transform((users) => users.map(u => u.id))
 * )
 * ```
 */
export declare function transform<T, U>(
  fn: (value: T, context: InterceptContext<T>) => U
): (factory: Factory<T>) => Factory<U>

/**
 * Create a memo decorator that caches the result forever.
 *
 * @example
 * ```ts
 * pipe(factory("Config", loadConfig), memo())
 * ```
 */
export declare function memo<T>(): FactoryDecorator<T>

/**
 * Create a retry decorator for flaky factories.
 *
 * @param attempts - Number of attempts (including first try)
 * @param delay - Delay between attempts in ms
 *
 * @example
 * ```ts
 * pipe(factory("API", connect), retry(3, 1000))
 * ```
 */
export declare function retry(
  attempts: number,
  delay?: number
): <T>(factory: Factory<T>) => Factory<Promise<T>>

/**
 * Create a timeout decorator for slow factories.
 *
 * @param ms - Timeout in milliseconds
 *
 * @example
 * ```ts
 * pipe(factory("DB", connect), withTimeout(5000))
 * ```
 */
export declare function withTimeout(ms: number): <T>(factory: Factory<T>) => Factory<Promise<T>>

/**
 * Apply a decorator only if a condition is true.
 *
 * @example
 * ```ts
 * pipe(
 *   factory("Service", fn),
 *   when(isDev, intercept(logging))
 * )
 * ```
 */
export declare function when<T>(
  condition: boolean | (() => boolean),
  decorator: FactoryDecorator<T>
): FactoryDecorator<T>

/**
 * Apply different decorators based on a condition.
 *
 * @example
 * ```ts
 * pipe(
 *   factory("DB", fn),
 *   ifElse(isTest, useMockDb, useRealDb)
 * )
 * ```
 */
export declare function ifElse<T>(
  condition: boolean | (() => boolean),
  ifTrue: FactoryDecorator<T>,
  ifFalse: FactoryDecorator<T>
): FactoryDecorator<T>
