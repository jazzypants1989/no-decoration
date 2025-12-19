/** @import { Container, ContainerOptions, Factory } from './container' */

/**
 * @param {Container} [parent]
 * @param {ContainerOptions} [options]
 * @returns {Container}
 */
function createContainerInternal(parent, options = {}) {
  const { detectCircular = true } = options

  /** @type {Map<Factory<any>, any>} */
  const cache = new Map()
  /** @type {Set<Factory<any>>} */
  const resolving = new Set()
  /** @type {Array<() => void | Promise<void>>} */
  const disposers = []

  /** @type {Container} */
  const container = {
    get(factory) {
      if (cache.has(factory)) return cache.get(factory)
      if (parent?.has(factory)) return parent.get(factory)

      if (detectCircular) {
        if (resolving.has(factory)) {
          const chain = [...resolving]
            .map((f) => f.name || "anonymous")
            .join(" -> ")
          throw new Error(
            `Circular dependency detected: ${chain} -> ${
              factory.name || "anonymous"
            }`
          )
        }
        resolving.add(factory)
      }

      try {
        const value = factory(container)

        if (value instanceof Promise) {
          const promise = value.then((resolved) => {
            cache.set(factory, resolved)
            return resolved
          })
          cache.set(factory, promise)
          return promise
        }

        cache.set(factory, value)
        return value
      } finally {
        if (detectCircular) resolving.delete(factory)
      }
    },

    onDispose(fn) {
      disposers.push(fn)
    },

    async dispose() {
      const errors = []
      for (const fn of disposers.reverse()) {
        try {
          await fn()
        } catch (e) {
          errors.push(e)
        }
      }
      disposers.length = 0
      cache.clear()
      if (errors.length) throw new AggregateError(errors, "Disposal failed")
    },

    has(factory) {
      return cache.has(factory) || (parent?.has(factory) ?? false)
    },
  }

  return container
}

/** @type {(options?: ContainerOptions) => Container} */
export function createContainer(options) {
  return createContainerInternal(undefined, options)
}

/** @type {(parent: Container, options?: ContainerOptions) => Container} */
export function childContainer(parent, options) {
  return createContainerInternal(parent, options)
}

/** @type {typeof import('./container').inject} */
export function inject(Class, ...deps) {
  return (c) => new Class(...deps.map((d) => c.get(d)))
}
