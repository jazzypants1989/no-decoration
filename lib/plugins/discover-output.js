/** @import * as D from './discover.js' */

/**
 * @param {D.DependencyEdge[]} edges
 * @returns {string[][]}
 */
function findCycles(edges) {
  /** @type {Map<string, string[]>} */
  const graph = new Map()

  for (const edge of edges) {
    if (!graph.has(edge.from)) graph.set(edge.from, [])
    if (edge.type !== 'dynamic') {
      const neighbors = graph.get(edge.from)
      if (neighbors) neighbors.push(edge.to)
    }
  }

  /** @type {string[][]} */
  const cycles = []
  /** @type {Set<string>} */
  const visited = new Set()
  /** @type {Set<string>} */
  const stack = new Set()
  /** @type {string[]} */
  const path = []

  /** @param {string} node */
  function dfs(node) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node)
      cycles.push([...path.slice(cycleStart), node])
      return
    }
    if (visited.has(node)) return

    visited.add(node)
    stack.add(node)
    path.push(node)

    for (const neighbor of (graph.get(node) || [])) {
      dfs(neighbor)
    }

    path.pop()
    stack.delete(node)
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node)
    }
  }

  return cycles
}

/**
 * @param {string} name
 * @returns {string}
 */
function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_')
}

/** @type {D.createDiscoveryResult} */
export function createDiscoveryResult(data) {
  const { factories, dependencies, exports, errors, external = [], outOfScope = [] } = data

  /** @type {Map<string, D.FactoryInfo>} */
  const factoryByName = new Map(factories.map(f => [f.name, f]))

  /** @type {Map<string, D.FactoryInfo[]>} */
  const factoriesByFile = new Map()
  for (const f of factories) {
    if (!factoriesByFile.has(f.file)) factoriesByFile.set(f.file, [])
    const arr = factoriesByFile.get(f.file)
    if (arr) arr.push(f)
  }

  return {
    factories,
    dependencies,
    exports,
    errors,

    getFactory(name) {
      return factoryByName.get(name)
    },

    getFactoriesInFile(filename) {
      return factoriesByFile.get(filename) || []
    },

    getDependentsOf(name) {
      const dependentNames = dependencies
        .filter(e => e.to === name)
        .map(e => e.from)
      return /** @type {D.FactoryInfo[]} */ (
        dependentNames.map(n => factoryByName.get(n)).filter(Boolean)
      )
    },

    getDependenciesOf(name) {
      const depNames = dependencies
        .filter(e => e.from === name)
        .map(e => e.to)
      return /** @type {D.FactoryInfo[]} */ (
        depNames.map(n => factoryByName.get(n)).filter(Boolean)
      )
    },

    getExportedFactories() {
      const exportedLocalNames = new Set(exports.map(e => e.localName))
      return factories.filter(f =>
        exportedLocalNames.has(f.localName || f.name)
      )
    },

    getTopologicalOrder() {
      /** @type {D.FactoryInfo[]} */
      const result = []
      /** @type {Set<string>} */
      const visited = new Set()
      /** @type {Set<string>} */
      const visiting = new Set()

      /** @param {string} name */
      const visit = (name) => {
        if (visited.has(name)) return
        if (visiting.has(name)) return

        visiting.add(name)

        const deps = dependencies.filter(e => e.from === name)
        for (const dep of deps) {
          if (factoryByName.has(dep.to)) {
            visit(dep.to)
          }
        }

        visiting.delete(name)
        visited.add(name)

        const factory = factoryByName.get(name)
        if (factory) result.push(factory)
      }

      for (const f of factories) {
        visit(f.name)
      }

      return result
    },

    validate() {
      const factoryNames = new Set(factories.map(f => f.name))
      const exportedNames = new Set(exports.map(e => e.localName))
      const referencedNames = new Set(dependencies.map(d => d.to))

      /** @type {D.ValidationReport} */
      const report = {
        valid: true,
        missing: [],
        circular: [],
        private: [],
        roots: [],
        dynamic: [],
        external,
        outOfScope
      }

      for (const edge of dependencies) {
        if (edge.type === 'dynamic') {
          report.dynamic.push({
            factory: edge.from,
            expr: edge.to,
            file: edge.file,
            line: edge.line
          })
          continue
        }

        if (!factoryNames.has(edge.to)) {
          report.missing.push({
            name: edge.to,
            referencedBy: edge.from,
            file: edge.file,
            line: edge.line
          })
        }
      }

      report.circular = findCycles(dependencies)

      for (const factory of factories) {
        if (!exportedNames.has(factory.localName || factory.name)) {
          report.private.push(factory)
        }
      }

      for (const factory of factories) {
        if (exportedNames.has(factory.localName || factory.name) &&
            !referencedNames.has(factory.name)) {
          report.roots.push(factory)
        }
      }

      report.valid = report.missing.length === 0 && report.circular.length === 0

      return report
    },

    toMermaid() {
      const lines = ['graph TD']

      for (const factory of factories) {
        const label = factory.options?.async ? `${factory.name} (async)` : factory.name
        lines.push(`    ${sanitize(factory.name)}["${label}"]`)
      }

      for (const edge of dependencies) {
        if (edge.type === 'dynamic') continue
        const style = edge.type === 'lazy' ? '-.->' : '-->'
        lines.push(`    ${sanitize(edge.from)} ${style} ${sanitize(edge.to)}`)
      }

      return lines.join('\n')
    },

    toDot() {
      const lines = [
        'digraph DependencyGraph {',
        '    rankdir=TB;',
        '    node [shape=box];',
        ''
      ]

      for (const factory of factories) {
        /** @type {string[]} */
        const attrs = []
        if (factory.options?.async) attrs.push('style=dashed')
        if (factory.options?.transient) attrs.push('color=blue')

        const attrStr = attrs.length ? ` [${attrs.join(', ')}]` : ''
        lines.push(`    "${factory.name}"${attrStr};`)
      }

      lines.push('')

      for (const edge of dependencies) {
        if (edge.type === 'dynamic') continue
        const style = edge.type === 'lazy' ? ' [style=dashed]' : ''
        lines.push(`    "${edge.from}" -> "${edge.to}"${style};`)
      }

      lines.push('}')

      return lines.join('\n')
    },

    toJSON() {
      return {
        version: '1.0',
        generated: new Date().toISOString(),
        factories: factories.map(f => ({
          name: f.name,
          type: f.type,
          file: f.file,
          line: f.line,
          deps: f.deps.map(d => d.resolvedName || d.name).filter(Boolean),
          options: f.options || null
        })),
        dependencies,
        exports,
        validation: this.validate()
      }
    }
  }
}
