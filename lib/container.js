// =============================================================================
// Dependency Injection Container
// No decorators. No reflection. No build step. Just functions.
// =============================================================================

/** @import { Container, Factory } from './container' */

/** @type {() => Container} */
export function createContainer() {
  /** @type {Map<Factory<any>, any>} */
  const cache = new Map()
  return {
    /** @type {Container['get']} */
    get(factory) {
      if (!cache.has(factory)) cache.set(factory, factory(this))
      return cache.get(factory)
    },
  }
}

/** @type {(parent: Container) => Container} */
export function childContainer(_parent) {
  /** @type {Map<Factory<any>, any>} */
  const cache = new Map()
  return {
    /** @type {Container['get']} */
    get(factory) {
      if (!cache.has(factory)) cache.set(factory, factory(this))
      return cache.get(factory)
    },
  }
}

/** @type {typeof import('./container').inject} */
export function inject(Class, ...deps) {
  return (c) => new Class(...deps.map((d) => c.get(d)))
}
