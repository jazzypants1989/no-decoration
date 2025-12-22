/**
 * Batch factory definition plugin.
 * Provides defineFactories() for batch creation with forward reference support.
 */

/** @import * as Types from '../core.js' */
/** @import * as BatchTypes from './batch.js' */

/**
 * @template {Record<string, Types.Factory<any>>} T
 * @param {T | ((factories: T) => T)} factoriesOrBuilder
 * @returns {T}
 */
export function defineFactories(factoriesOrBuilder) {
  /** @type {Record<string, Types.Factory<unknown>>} */
  const result = {}

  if (typeof factoriesOrBuilder === "function") {
    /** @type {ProxyHandler<Record<string, Types.Factory<unknown>>>} */
    const handler = {
      get(_, key) {
        const stringKey = String(key)
        if (!result[stringKey]) {
          /** @type {Types.Factory<unknown>} */
          const placeholder = (/** @type {Types.Container} */ c) => {
            const inner = result[stringKey]?._inner
            if (!inner) {
              throw new Error(`Factory "${stringKey}" not yet defined`)
            }
            return inner(c)
          }
          placeholder.displayName = stringKey
          result[stringKey] = placeholder
        }
        return result[stringKey]
      },
    }
    const placeholders = /** @type {typeof factoriesOrBuilder extends (f: infer R) => unknown ? R : never} */ (
      new Proxy({}, handler)
    )

    const factories = factoriesOrBuilder(placeholders)

    for (const [key, factory] of Object.entries(factories)) {
      if (result[key]) {
        result[key]._inner = factory
      } else {
        /** @type {Types.Factory<unknown>} */
        const namedFactory = (/** @type {Types.Container} */ c) => factory(c)
        namedFactory.displayName = key
        namedFactory._inner = factory
        result[key] = namedFactory
      }
    }
  } else {
    for (const [key, factory] of Object.entries(factoriesOrBuilder)) {
      /** @type {Types.Factory<unknown>} */
      const namedFactory = (/** @type {Types.Container} */ c) => factory(c)
      namedFactory.displayName = key
      namedFactory._inner = factory
      result[key] = namedFactory
    }
  }

  // Cast needed: we build result dynamically but .d.ts promises T
  return /** @type {T} */ (result)
}

/** @type {BatchTypes.batch} */
export const batch = {
  name: "batch",
  apply() {
    return { defineFactories }
  },
}
