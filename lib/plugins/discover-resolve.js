/** @import * as D from './discover.js' */

import { dirname, resolve, join } from "node:path"

/**
 * @param {string} fromFile
 * @param {string} source
 * @param {Set<string>} [knownFiles] - Set of known virtual file paths
 */
function resolveModulePath(fromFile, source, knownFiles) {
  if (source.startsWith(".")) {
    const dir = dirname(fromFile)
    let resolved = join(dir, source)

    // Normalize the path (remove ./ and resolve ..)
    resolved = resolved.replace(/^\.\//, "")

    // Try adding .js extension only if no extension present
    if (!resolved.endsWith(".js") && !resolved.endsWith(".ts") &&
        !resolved.endsWith(".jsx") && !resolved.endsWith(".tsx") &&
        !resolved.endsWith(".mjs") && !resolved.endsWith(".cjs")) {
      resolved = resolved + ".js"
    }

    // For virtual files, check if the resolved path exists in known files
    if (knownFiles) {
      // Try both the resolved path and as a simple filename
      if (knownFiles.has(resolved)) return resolved

      // Try just the basename
      const basename = resolved.split("/").pop() || resolved
      if (knownFiles.has(basename)) return basename

      // Try without leading ./
      const withoutDot = resolved.replace(/^\.\//, "")
      if (knownFiles.has(withoutDot)) return withoutDot
    }

    // For real files, return absolute path
    if (!knownFiles) {
      return resolve(dir, source.replace(/^\.\//, ""))
    }

    return resolved
  }
  // Bare specifier - external package
  return null
}

/**
 * @param {string} source
 */
function isExternalImport(source) {
  return !source.startsWith(".") && !source.startsWith("/")
}

/**
 * @param {Map<string, D.FileAnalysis>} fileAnalyses
 * @param {number} maxDepth
 * @param {Set<string>} [knownFiles]
 * @returns {Map<string, Map<string, { factoryName: string, sourceFile: string }>>}
 */
function buildExportMaps(fileAnalyses, maxDepth, knownFiles) {
  /** @type {Map<string, Map<string, { factoryName: string, sourceFile: string }>>} */
  const exportMaps = new Map()

  // First pass: direct exports
  for (const [file, analysis] of fileAnalyses) {
    /** @type {Map<string, { factoryName: string, sourceFile: string }>} */
    const exports = new Map()

    for (const exp of analysis.exports) {
      if (!exp.reexport) {
        // Find factory with matching localName
        const factory = analysis.factories.find(f =>
          f.localName === exp.localName || f.name === exp.localName
        )
        if (factory) {
          exports.set(exp.exportedAs, {
            factoryName: factory.name,
            sourceFile: file
          })
        }
      }
    }

    exportMaps.set(file, exports)
  }

  // Second pass: resolve re-exports iteratively
  for (let depth = 0; depth < maxDepth; depth++) {
    let changed = false

    for (const [file, analysis] of fileAnalyses) {
      const exports = exportMaps.get(file)
      if (!exports) continue

      for (const exp of analysis.exports) {
        if (exp.reexport && exp.sourceModule) {
          const sourceFile = resolveModulePath(file, exp.sourceModule, knownFiles)
          if (!sourceFile) continue

          const sourceExports = exportMaps.get(sourceFile)
          if (!sourceExports) continue

          if (exp.wildcard) {
            // export * from './other'
            for (const [name, info] of sourceExports) {
              if (!exports.has(name)) {
                exports.set(name, info)
                changed = true
              }
            }
          } else {
            // export { x } from './other'
            const info = sourceExports.get(exp.localName)
            if (info && !exports.has(exp.exportedAs)) {
              exports.set(exp.exportedAs, info)
              changed = true
            }
          }
        }
      }
    }

    if (!changed) break
  }

  return exportMaps
}

/**
 * @param {Map<string, D.FileAnalysis>} fileAnalyses
 * @param {Map<string, Map<string, { factoryName: string, sourceFile: string }>>} exportMaps
 * @param {Set<string>} [knownFiles]
 * @returns {Map<string, Map<string, { factoryName: string, sourceFile: string }>>}
 */
function buildImportMaps(fileAnalyses, exportMaps, knownFiles) {
  /** @type {Map<string, Map<string, { factoryName: string, sourceFile: string }>>} */
  const importMaps = new Map()

  for (const [file, analysis] of fileAnalyses) {
    /** @type {Map<string, { factoryName: string, sourceFile: string }>} */
    const imports = new Map()

    // Add local factories
    for (const factory of analysis.factories) {
      const localName = factory.localName || factory.name
      imports.set(localName, {
        factoryName: factory.name,
        sourceFile: file
      })
    }

    // Add imported factories
    for (const imp of analysis.imports) {
      if (imp.namespace) continue // Can't resolve namespace imports statically

      const sourceFile = resolveModulePath(file, imp.source, knownFiles)
      if (!sourceFile) continue

      const sourceExports = exportMaps.get(sourceFile)
      if (!sourceExports) continue

      const info = sourceExports.get(imp.importedName)
      if (info) {
        imports.set(imp.localName, info)
      }
    }

    importMaps.set(file, imports)
  }

  return importMaps
}

/**
 * @param {string} file
 * @param {string} identifier
 * @param {Map<string, Map<string, { factoryName: string, sourceFile: string }>>} importMaps
 */
function resolveIdentifier(file, identifier, importMaps) {
  const imports = importMaps.get(file)
  if (!imports) return null
  return imports.get(identifier) || null
}

/**
 * Resolve cross-file dependencies.
 *
 * @param {Map<string, D.FileAnalysis>} fileAnalyses
 * @param {D.DiscoverOptions} options
 */
export function resolveImports(fileAnalyses, options) {
  const maxDepth = options.maxReexportDepth ?? 3

  // Create set of known files for virtual file resolution
  const knownFiles = new Set(fileAnalyses.keys())

  const exportMaps = buildExportMaps(fileAnalyses, maxDepth, knownFiles)
  const importMaps = buildImportMaps(fileAnalyses, exportMaps, knownFiles)

  /** @type {D.FactoryInfo[]} */
  const resolvedFactories = []
  /** @type {D.DependencyEdge[]} */
  const edges = []
  /** @type {Array<{ source: string, file: string, line: number }>} */
  const external = []
  /** @type {Array<{ source: string, resolvedPath: string, file: string, line: number }>} */
  const outOfScope = []

  // Categorize unresolved imports
  for (const [file, analysis] of fileAnalyses) {
    for (const imp of analysis.imports) {
      if (isExternalImport(imp.source)) {
        external.push({ source: imp.source, file, line: imp.line })
      } else {
        const resolved = resolveModulePath(file, imp.source, knownFiles)
        if (resolved && !fileAnalyses.has(resolved)) {
          outOfScope.push({
            source: imp.source,
            resolvedPath: resolved,
            file,
            line: imp.line
          })
        }
      }
    }
  }

  // Resolve factory dependencies
  for (const [file, analysis] of fileAnalyses) {
    for (const factory of analysis.factories) {
      /** @type {D.DependencyRef[]} */
      const resolvedDeps = []

      for (const dep of factory.deps) {
        if (dep.type === "dynamic" || dep.name === null) {
          resolvedDeps.push(dep)
          edges.push({
            from: factory.name,
            to: dep.dynamicExpr || "<dynamic>",
            type: "dynamic",
            file,
            line: factory.line
          })
          continue
        }

        const resolved = resolveIdentifier(file, dep.name, importMaps)

        if (resolved) {
          resolvedDeps.push({
            ...dep,
            resolvedName: resolved.factoryName,
            resolvedFile: resolved.sourceFile
          })
          edges.push({
            from: factory.name,
            to: resolved.factoryName,
            type: dep.type,
            file,
            line: factory.line,
            resolved: true
          })
        } else {
          // Couldn't resolve - keep original
          resolvedDeps.push(dep)
          edges.push({
            from: factory.name,
            to: dep.name,
            type: dep.type,
            file,
            line: factory.line,
            resolved: false
          })
        }
      }

      resolvedFactories.push({ ...factory, deps: resolvedDeps })
    }
  }

  return {
    factories: resolvedFactories,
    edges,
    external,
    outOfScope
  }
}
