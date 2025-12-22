/** @import * as Types from '../core.js' */
/** @import * as PatternTypes from './patterns.js' */

/**
 * @template T
 * @param {PatternTypes.Factory<T>} factory
 * @param {...PatternTypes.FactoryDecorator<T>} decorators
 */
export function pipe(factory, ...decorators) {
  return decorators.reduce((f, decorator) => decorator(f), factory)
}

export class GuardError extends Error {
  /**
   * @param {string} message
   * @param {string} [factoryName]
   */
  constructor(message, factoryName) {
    super(message)
    this.name = "GuardError"
    this.factoryName = factoryName
  }
}

/**
 * @template T
 * @param {PatternTypes.Factory<T>} factory
 * @param {PatternTypes.GuardFn} guardFn
 */
function createGuardedFactory(factory, guardFn) {
  /** @type {PatternTypes.Factory<T>} */
  const guarded = (c) => {
    const result = guardFn(c)

    // Handle async guards
    if (result instanceof Promise) {
      return /** @type {T} */ (
        result.then((allowed) => {
          if (allowed === false) {
            throw new GuardError(
              `Access denied to ${factory.displayName || "factory"}`,
              factory.displayName
            )
          }
          return factory(c)
        })
      )
    }

    // Handle sync guards
    if (result === false) {
      throw new GuardError(
        `Access denied to ${factory.displayName || "factory"}`,
        factory.displayName
      )
    }

    return factory(c)
  }

  guarded.displayName = factory.displayName
  guarded._inner = factory
  return guarded
}

/**
 * @param {PatternTypes.GuardFn} guardFn
 */
export function guard(guardFn) {
  /**
   * @template T
   * @param {PatternTypes.Factory<T>} factory
   */
  const decorator = (factory) => createGuardedFactory(factory, guardFn)
  return decorator
}

export class ValidationError extends Error {
  /**
   * @param {string} message
   * @param {string} [factoryName]
   * @param {unknown} [cause]
   */
  constructor(message, factoryName, cause) {
    super(message)
    this.name = "ValidationError"
    this.factoryName = factoryName
    this.cause = cause
  }
}

/**
 * @template T
 * @param {PatternTypes.Schema<T> | PatternTypes.ValidatorFn<T>} schemaOrFn
 */
export function validate(schemaOrFn) {
  /** @type {(value: T) => T} */
  const validator =
    typeof schemaOrFn === "function"
      ? schemaOrFn
      : (v) => /** @type {PatternTypes.Schema<T>} */ (schemaOrFn).parse(v)

  /**
   * @param {PatternTypes.Factory<T>} factory
   */
  const decorator = (factory) => {
    /** @type {PatternTypes.Factory<T>} */
    const validated = (c) => {
      const value = factory(c)

      // Handle async factories
      if (value instanceof Promise) {
        return /** @type {T} */ (
          value.then((resolved) => {
            try {
              return validator(/** @type {T} */ (resolved))
            } catch (e) {
              throw new ValidationError(
                `Validation failed for ${factory.displayName || "factory"}: ${
                  e instanceof Error ? e.message : e
                }`,
                factory.displayName,
                e
              )
            }
          })
        )
      }

      // Handle sync factories
      try {
        return validator(value)
      } catch (e) {
        throw new ValidationError(
          `Validation failed for ${factory.displayName || "factory"}: ${
            e instanceof Error ? e.message : e
          }`,
          factory.displayName,
          e
        )
      }
    }

    validated.displayName = factory.displayName
    validated._inner = factory
    return validated
  }
  return decorator
}

/**
 * @template T
 * @param {PatternTypes.InterceptorFn<T>} interceptorFn
 * @returns {PatternTypes.FactoryDecorator<T>}
 */
export function intercept(interceptorFn) {
  return (factory) => {
    /** @param {Types.Container} c */
    const intercepted = (c) => {
      return interceptorFn(() => factory(c), {
        container: c,
        factory,
      })
    }

    intercepted.displayName = factory.displayName
    intercepted._inner = factory
    return intercepted
  }
}

/**
 * @template T
 * @param {PatternTypes.ErrorHandler<T>} handler
 */
export function catchError(handler) {
  /**
   * @param {PatternTypes.Factory<T>} factory
   */
  const decorator = (factory) => {
    /** @type {PatternTypes.Factory<T>} */
    const caught = (c) => {
      try {
        const value = factory(c)

        // Handle async factories
        if (value instanceof Promise) {
          return /** @type {T} */ (
            value.catch((e) => handler(e, { container: c, factory }))
          )
        }

        return value
      } catch (e) {
        return handler(e, { container: c, factory })
      }
    }

    caught.displayName = factory.displayName
    caught._inner = factory
    return caught
  }
  return decorator
}

/**
 * @template T
 * @param {(value: T, context: PatternTypes.InterceptContext<T>) => void} fn
 */
export function tap(fn) {
  return intercept(
    /** @type {PatternTypes.InterceptorFn<T>} */ (
      (next, ctx) => {
        const value = next()
        if (value instanceof Promise) {
          return /** @type {T} */ (
            value.then((resolved) => {
              fn(resolved, ctx)
              return resolved
            })
          )
        }
        fn(value, ctx)
        return value
      }
    )
  )
}

/**
 * @template T, U
 * @param {(value: T, context: PatternTypes.InterceptContext<T>) => U} fn
 */
export function transform(fn) {
  /**
   * @param {PatternTypes.Factory<U>} factory
   */
  const decorator = (factory) => {
    /** @type {PatternTypes.Factory<U>} */
    const transformed = (c) => {
      const value = factory(c)
      /** @type {PatternTypes.InterceptContext<T>} */
      const ctx = {
        container: c,
        factory: /** @type {PatternTypes.Factory<T>} */ (
          /** @type {unknown} */ (factory)
        ),
      }
      if (value instanceof Promise) {
        return /** @type {U} */ (
          value.then((resolved) =>
            fn(/** @type {T} */ (/** @type {unknown} */ (resolved)), ctx)
          )
        )
      }
      return fn(/** @type {T} */ (/** @type {unknown} */ (value)), ctx)
    }
    transformed.displayName = factory.displayName
    transformed._inner = factory
    return transformed
  }
  return decorator
}

export function memo() {
  /** @type {{ value: unknown } | null} */
  let cached = null

  /**
   * @template T
   * @param {PatternTypes.Factory<T>} factory
   */
  const decorator = (factory) => {
    /** @type {PatternTypes.Factory<T>} */
    const memoized = (c) => {
      if (cached) return /** @type {T} */ (cached.value)
      const value = factory(c)
      if (value instanceof Promise) {
        return /** @type {T} */ (
          value.then((resolved) => {
            cached = { value: resolved }
            return resolved
          })
        )
      }
      cached = { value }
      return value
    }
    memoized.displayName = factory.displayName
    memoized._inner = factory
    return memoized
  }
  return decorator
}

/**
 * @param {number} attempts
 * @param {number} [delay=0]
 * @returns {<T>(factory: PatternTypes.Factory<T>) => PatternTypes.Factory<Promise<T>>}
 */
export function retry(attempts, delay = 0) {
  return (factory) => {
    /** @param {Types.Container} c */
    const retried = async (c) => {
      let lastError
      for (let i = 0; i < attempts; i++) {
        try {
          const value = factory(c)
          return value instanceof Promise ? await value : value
        } catch (e) {
          lastError = e
          if (i < attempts - 1 && delay > 0) {
            await new Promise((r) => setTimeout(r, delay))
          }
        }
      }
      throw lastError
    }
    retried.displayName = factory.displayName
    retried._inner = factory
    return retried
  }
}

/**
 * @param {number} ms
 * @returns {<T>(factory: PatternTypes.Factory<T>) => PatternTypes.Factory<Promise<T>>}
 */
export function withTimeout(ms) {
  return (factory) => {
    /** @param {Types.Container} c */
    const timed = async (c) => {
      const value = factory(c)
      if (!(value instanceof Promise)) return value

      const timeout = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Timeout after ${ms}ms resolving ${
                factory.displayName || "factory"
              }`
            )
          )
        }, ms)
      })

      return Promise.race([value, timeout])
    }
    timed.displayName = factory.displayName
    timed._inner = factory
    return timed
  }
}

/**
 * @template T
 * @param {boolean | (() => boolean)} condition
 * @param {PatternTypes.FactoryDecorator<T>} decorator
 * @returns {PatternTypes.FactoryDecorator<T>}
 */
export function when(condition, decorator) {
  const shouldApply = typeof condition === "function" ? condition() : condition
  return (factory) => (shouldApply ? decorator(factory) : factory)
}

/**
 * @template T
 * @param {boolean | (() => boolean)} condition
 * @param {PatternTypes.FactoryDecorator<T>} ifTrue
 * @param {PatternTypes.FactoryDecorator<T>} ifFalse
 * @returns {PatternTypes.FactoryDecorator<T>}
 */
export function ifElse(condition, ifTrue, ifFalse) {
  const shouldApply = typeof condition === "function" ? condition() : condition
  return (factory) => (shouldApply ? ifTrue(factory) : ifFalse(factory))
}
