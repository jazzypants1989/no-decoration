/**
 * Testing plugin for mocking and state management.
 * Adds withMocks(), snapshot(), and restore() methods.
 */

/** @import * as Types from '../core.js' */
/** @import * as TestTypes from './testing.js' */

import { childContainer } from "../core.js"

/** @type {TestTypes.testing} */
export const testing = {
  name: "testing",

  /**
   * @param {Types.Container} container
   * @param {Types.ContainerInternals} internals
   */
  apply(container, internals) {
    const { cache, overrides } = internals

    return {
      /**
       * @param {Array<[Types.Factory<unknown>, Types.Factory<unknown>]> | Map<Types.Factory<unknown>, Types.Factory<unknown>>} mocks
       */
      withMocks(mocks) {
        const child = childContainer(container)

        if (mocks instanceof Map) {
          for (const [factory, replacement] of mocks) {
            child.override(factory, replacement)
          }
        } else if (Array.isArray(mocks)) {
          for (const [factory, replacement] of mocks) {
            child.override(factory, replacement)
          }
        }

        return child.with(testing)
      },

      snapshot() {
        return {
          cache: new Map(cache),
          overrides: new Map(overrides),
        }
      },

      /** @param {TestTypes.ContainerSnapshot} snap */
      restore(snap) {
        cache.clear()
        overrides.clear()
        for (const [k, v] of snap.cache) cache.set(k, v)
        for (const [k, v] of snap.overrides) overrides.set(k, v)
      },
    }
  },
}
