/** @import * as D from './discover.js' */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import { parseString } from "./discover-string.js"
import { createCache } from "./discover-cache.js"
import { resolveImports } from "./discover-resolve.js"
import { createDiscoveryResult } from "./discover-output.js"

// Re-export for convenience
export { createCache } from "./discover-cache.js"
export { createDiscoveryResult } from "./discover-output.js"
export { parseString } from "./discover-string.js"

// ═══════════════════════════════════════════════════════════════════
// FILE SCANNING
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {string} dir
 * @param {string} [cwd]
 * @returns {string[]}
 */
function scanDirectory(dir, cwd) {
  const fullDir = cwd ? resolve(cwd, dir) : dir
  /** @type {string[]} */
  const files = []

  /**
   * @param {string} d
   */
  function scan(d) {
    let entries
    try {
      entries = readdirSync(d)
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(d, entry)
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        if (!entry.startsWith(".") && entry !== "node_modules") {
          scan(fullPath)
        }
      } else if (entry.endsWith(".js") || entry.endsWith(".ts") ||
                 entry.endsWith(".jsx") || entry.endsWith(".tsx")) {
        files.push(fullPath)
      }
    }
  }

  scan(fullDir)
  return files
}

/**
 * @param {string[] | Record<string, string>} files
 * @param {string} [cwd]
 * @returns {{ isVirtual: boolean, files: string[] | Record<string, string> }}
 */
function normalizeFiles(files, cwd) {
  if (Array.isArray(files)) {
    // Glob patterns - scan directories
    /** @type {string[]} */
    const allFiles = []
    for (const pattern of files) {
      // Simple handling: if it looks like a directory, scan it
      // For real glob support, users should pre-expand patterns
      if (pattern.includes("*")) {
        // Basic glob: src/**/*.js -> scan src/
        const baseDir = pattern.split("*")[0].replace(/\/$/, "") || "."
        const fullBaseDir = cwd ? resolve(cwd, baseDir) : resolve(baseDir)
        allFiles.push(...scanDirectory(fullBaseDir))
      } else {
        // Single file or directory - always resolve to absolute path
        const fullPath = cwd ? resolve(cwd, pattern) : resolve(pattern)
        try {
          const stat = statSync(fullPath)
          if (stat.isDirectory()) {
            allFiles.push(...scanDirectory(fullPath))
          } else {
            allFiles.push(fullPath)
          }
        } catch {
          // File doesn't exist, skip
        }
      }
    }
    return { isVirtual: false, files: allFiles }
  }

  // Virtual files (Record<string, string>)
  return { isVirtual: true, files }
}

// ═══════════════════════════════════════════════════════════════════
// LEVEL 3: AST PATTERNS (simple ESTree walker)
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {unknown} ast
 * @param {(node: unknown) => void} visitor
 */
function walkESTree(ast, visitor) {
  /**
   * @param {unknown} node
   */
  function visit(node) {
    if (!node || typeof node !== "object") return

    const n = /** @type {Record<string, unknown>} */ (node)
    visitor(node)

    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "range" || key === "start" || key === "end") {
        continue
      }

      const child = n[key]

      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && "type" in item) {
            visit(item)
          }
        }
      } else if (child && typeof child === "object" && "type" in child) {
        visit(child)
      }
    }
  }

  visit(ast)
}

/**
 * @param {string} filename
 * @returns {D.PatternHelpers}
 */
function createPatternHelpers(filename) {
  return {
    getStringValue(node) {
      if (!node || typeof node !== "object") return null
      const n = /** @type {Record<string, unknown>} */ (node)

      if (n.type === "Literal" && typeof n.value === "string") {
        return n.value
      }

      if (n.type === "TemplateLiteral") {
        const quasis = /** @type {Array<{ value: { raw: string } }>} */ (n.quasis)
        const expressions = /** @type {unknown[]} */ (n.expressions)
        if (expressions.length === 0 && quasis.length > 0) {
          return quasis[0]?.value?.raw || null
        }
      }

      return null
    },

    findDepsInFunction(fnNode) {
      if (!fnNode) return []

      /** @type {D.DependencyRef[]} */
      const deps = []
      /** @type {Set<string>} */
      const seen = new Set()

      walkESTree(fnNode, (node) => {
        const n = /** @type {Record<string, unknown>} */ (node)

        // c.get(identifier)
        if (n.type === "CallExpression") {
          const callee = /** @type {Record<string, unknown>} */ (n.callee)
          if (callee?.type === "MemberExpression") {
            const prop = /** @type {Record<string, unknown>} */ (callee.property)
            if (prop?.name === "get") {
              const args = /** @type {Array<Record<string, unknown>>} */ (n.arguments)
              const arg = args?.[0]
              if (arg?.type === "Identifier" && typeof arg.name === "string") {
                if (!seen.has(arg.name)) {
                  seen.add(arg.name)
                  deps.push({ name: arg.name, type: "direct" })
                }
              } else if (arg) {
                deps.push({ name: null, type: "dynamic", dynamicExpr: String(arg.type) })
              }
            }
          }

          // lazy(c, identifier)
          if (callee?.type === "Identifier" && callee.name === "lazy") {
            const args = /** @type {Array<Record<string, unknown>>} */ (n.arguments)
            const arg = args?.[1]
            if (arg?.type === "Identifier" && typeof arg.name === "string") {
              if (!seen.has(arg.name)) {
                seen.add(arg.name)
                deps.push({ name: arg.name, type: "lazy" })
              }
            }
          }
        }
      })

      return deps
    },

    isIdentifier(node, name) {
      if (!node || typeof node !== "object") return false
      const n = /** @type {Record<string, unknown>} */ (node)
      return n.type === "Identifier" && n.name === name
    },

    isCallExpression(node, calleeName) {
      if (!node || typeof node !== "object") return false
      const n = /** @type {Record<string, unknown>} */ (node)
      if (n.type !== "CallExpression") return false
      const callee = /** @type {Record<string, unknown>} */ (n.callee)
      return callee?.type === "Identifier" && callee.name === calleeName
    },

    getLoc(node) {
      if (!node || typeof node !== "object") return null
      const n = /** @type {Record<string, unknown>} */ (node)
      const loc = /** @type {{ start: { line: number, column?: number } } | undefined} */ (n.loc)
      if (loc?.start) {
        return { line: loc.start.line, column: loc.start.column }
      }
      return null
    },

    getFilename() {
      return filename
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// BUILT-IN PATTERNS
// ═══════════════════════════════════════════════════════════════════

/** @type {{ factory(): D.Pattern, inject(): D.Pattern, custom(config: { name: string, match: (node: unknown) => boolean, extract: (node: unknown, helpers: D.PatternHelpers) => Partial<D.FactoryInfo> | null }): D.Pattern }} */
export const patterns = {
  factory() {
    return {
      name: "factory",
      match(node) {
        const n = /** @type {Record<string, unknown>} */ (node)
        if (n.type !== "CallExpression") return false
        const callee = /** @type {Record<string, unknown>} */ (n.callee)
        if (callee?.type !== "Identifier") return false
        if (callee.name !== "factory" && callee.name !== "named") return false
        const args = /** @type {unknown[]} */ (n.arguments)
        return args?.length >= 2
      },
      extract(node, helpers) {
        const n = /** @type {Record<string, unknown>} */ (node)
        const args = /** @type {unknown[]} */ (n.arguments)
        const nameArg = args[0]
        const fnArg = args[1]

        const name = helpers.getStringValue(nameArg)
        if (!name) return null

        const deps = helpers.findDepsInFunction(fnArg)
        const loc = helpers.getLoc(node)

        return {
          name,
          type: "factory",
          deps,
          file: helpers.getFilename(),
          line: loc?.line ?? 0
        }
      }
    }
  },

  inject() {
    return {
      name: "inject",
      match(node) {
        const n = /** @type {Record<string, unknown>} */ (node)
        if (n.type !== "CallExpression") return false
        const callee = /** @type {Record<string, unknown>} */ (n.callee)
        return callee?.type === "Identifier" && callee.name === "inject"
      },
      extract(node, helpers) {
        const n = /** @type {Record<string, unknown>} */ (node)
        const args = /** @type {Array<Record<string, unknown>>} */ (n.arguments)
        const classArg = args[0]

        if (classArg?.type !== "Identifier") return null
        const name = /** @type {string} */ (classArg.name)

        const deps = args.slice(1).map(arg => ({
          name: arg.type === "Identifier" ? /** @type {string} */ (arg.name) : null,
          type: /** @type {"direct" | "dynamic"} */ (arg.type === "Identifier" ? "direct" : "dynamic")
        }))

        const loc = helpers.getLoc(node)

        return {
          name,
          type: "inject",
          deps,
          file: helpers.getFilename(),
          line: loc?.line ?? 0
        }
      }
    }
  },

  custom(config) {
    return {
      name: config.name,
      match: config.match,
      extract: config.extract
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN DISCOVER FUNCTION
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {D.DiscoverOptions | string[]} optionsOrFiles
 * @returns {Promise<D.DiscoveryResult>}
 */
export async function discover(optionsOrFiles) {
  const options = Array.isArray(optionsOrFiles)
    ? { files: optionsOrFiles }
    : optionsOrFiles

  const { files, parse, ast, walk, cache: cacheOption, cwd } = options
  const patternsToUse = options.patterns ?? [patterns.factory(), patterns.inject()]

  const { isVirtual, files: normalizedFiles } = normalizeFiles(files, cwd)

  // Set up cache if enabled
  const cache = cacheOption === true
    ? createCache(options)
    : cacheOption || null

  /** @type {Map<string, D.FileAnalysis>} */
  const fileAnalyses = new Map()
  /** @type {D.ParseError[]} */
  const errors = []
  /** @type {D.ExportInfo[]} */
  const allExports = []

  // Analyze each file
  const fileList = isVirtual
    ? Object.keys(normalizedFiles)
    : /** @type {string[]} */ (normalizedFiles)

  for (const file of fileList) {
    const code = isVirtual
      ? /** @type {Record<string, string>} */ (normalizedFiles)[file]
      : readFileSync(file, "utf-8")

    // Check cache
    if (cache) {
      const cached = cache.get(file, code)
      if (cached) {
        fileAnalyses.set(file, cached)
        allExports.push(...cached.exports)
        continue
      }
    }

    /** @type {D.FileAnalysis} */
    let analysis

    try {
      // Level 3: AST + patterns (highest precedence)
      if (ast) {
        const astResult = await ast(code, file)
        const walker = walk ?? walkESTree
        const helpers = createPatternHelpers(file)

        /** @type {D.FactoryInfo[]} */
        const factories = []

        walker(astResult, (node) => {
          for (const pattern of patternsToUse) {
            if (pattern.match(node)) {
              const info = pattern.extract(node, helpers)
              if (info && info.name) {
                factories.push(/** @type {D.FactoryInfo} */ ({
                  type: "factory",
                  file,
                  line: 0,
                  deps: [],
                  ...info
                }))
              }
            }
          }
        })

        // For AST mode, we still need imports/exports from string parser
        const stringAnalysis = parseString(code, file)

        analysis = {
          factories,
          imports: stringAnalysis.imports,
          exports: stringAnalysis.exports
        }
      }
      // Level 2: Custom parser
      else if (parse) {
        analysis = await parse(code, file)
      }
      // Level 1: String parser (default)
      else {
        analysis = parseString(code, file)
      }
    } catch (err) {
      errors.push({
        file,
        message: err instanceof Error ? err.message : String(err),
        fatal: true
      })
      continue
    }

    // Cache the result
    if (cache) {
      cache.set(file, code, analysis)
    }

    fileAnalyses.set(file, analysis)
    allExports.push(...analysis.exports)
    if (analysis.errors) {
      errors.push(...analysis.errors)
    }
  }

  // Resolve cross-file dependencies
  const resolved = resolveImports(fileAnalyses, options)

  return createDiscoveryResult({
    factories: resolved.factories,
    dependencies: resolved.edges,
    exports: allExports,
    errors,
    external: resolved.external,
    outOfScope: resolved.outOfScope
  })
}
