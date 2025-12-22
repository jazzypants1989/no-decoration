/** @import * as D from './discover.js' */

/**
 * @param {string} str
 * @returns {string}
 */
function quickHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}

/**
 * @param {D.DiscoverOptions} options
 * @returns {string}
 */
function hashOptions(options) {
  const relevant = {
    hasCustomParse: !!options.parse,
    hasCustomAst: !!options.ast,
    hasCustomWalk: !!options.walk,
    patternNames: options.patterns?.map(p => p.name).sort() || [],
    maxReexportDepth: options.maxReexportDepth ?? 3
  }
  return quickHash(JSON.stringify(relevant))
}

/** @type {D.createCache} */
export function createCache(options) {
  /** @type {Map<string, D.CacheEntry>} */
  const cache = new Map()
  const optionsHash = hashOptions(options)

  return {
    get(filename, code) {
      const contentHash = quickHash(code)
      const entry = cache.get(filename)

      if (entry &&
          entry.contentHash === contentHash &&
          entry.optionsHash === optionsHash) {
        return entry.analysis
      }

      return null
    },

    set(filename, code, analysis) {
      const contentHash = quickHash(code)
      cache.set(filename, {
        contentHash,
        optionsHash,
        analysis,
        timestamp: Date.now()
      })
    },

    invalidate(filename) {
      cache.delete(filename)
    },

    clear() {
      cache.clear()
    },

    stats() {
      return {
        size: cache.size,
        entries: [...cache.keys()]
      }
    }
  }
}
