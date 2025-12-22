/** @import * as D from './discover.js' */

// ═══════════════════════════════════════════════════════════════════
// STRING HELPERS (no regex, just indexOf/slice/charAt)
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {string} str
 * @param {number} pos
 */
function skipWhitespace(str, pos) {
  while (pos < str.length && " \t\n\r".includes(str[pos])) {
    pos++
  }
  return pos
}

/**
 * @param {string} c
 */
function isIdentChar(c) {
  return (c >= "a" && c <= "z") ||
         (c >= "A" && c <= "Z") ||
         (c >= "0" && c <= "9") ||
         c === "_" || c === "$"
}

/**
 * @param {string} str
 * @param {number} startPos
 */
function extractQuoted(str, startPos) {
  let pos = skipWhitespace(str, startPos)
  if (pos >= str.length) return null

  const quote = str[pos]
  if (quote !== '"' && quote !== "'" && quote !== "`") return null

  const contentStart = pos + 1
  const contentEnd = str.indexOf(quote, contentStart)
  if (contentEnd === -1) return null

  return {
    value: str.slice(contentStart, contentEnd),
    endPos: contentEnd + 1
  }
}

/**
 * @param {string} str
 * @param {number} startPos
 */
function extractIdentifier(str, startPos) {
  let pos = skipWhitespace(str, startPos)

  const start = pos
  while (pos < str.length && isIdentChar(str[pos])) pos++

  return pos > start ? { value: str.slice(start, pos), endPos: pos } : null
}

/**
 * @param {string} content
 * @param {number} position
 */
function getLineNumber(content, position) {
  let line = 1
  for (let i = 0; i < position && i < content.length; i++) {
    if (content[i] === "\n") line++
  }
  return line
}

/**
 * @param {string} str
 * @param {number} openPos
 * @param {string} openChar
 * @param {string} closeChar
 */
function findBalancedClose(str, openPos, openChar = "(", closeChar = ")") {
  let depth = 1
  let pos = openPos + 1
  while (pos < str.length && depth > 0) {
    if (str[pos] === openChar) depth++
    else if (str[pos] === closeChar) depth--
    if (depth > 0) pos++
  }
  return depth === 0 ? pos : -1
}

// ═══════════════════════════════════════════════════════════════════
// FACTORY DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {string} content
 * @param {string} file
 */
function findFactories(content, file) {
  /** @type {D.FactoryInfo[]} */
  const results = []

  // Look for factory( or named(
  for (const funcName of ["factory", "named"]) {
    const searchTerm = funcName + "("
    let searchPos = 0

    while (true) {
      const index = content.indexOf(searchTerm, searchPos)
      if (index === -1) break

      // Make sure it's not part of a larger identifier (e.g., "myFactory(")
      if (index > 0 && isIdentChar(content[index - 1])) {
        searchPos = index + 1
        continue
      }

      const afterParen = index + searchTerm.length
      const quoted = extractQuoted(content, afterParen)

      if (quoted) {
        const line = getLineNumber(content, index)

        // Find the end of the factory call to look for deps
        const closePos = findBalancedClose(content, index + funcName.length)
        const factoryBody = closePos > 0
          ? content.slice(afterParen, closePos)
          : content.slice(afterParen, Math.min(content.length, afterParen + 500))

        const deps = findDepsInBody(factoryBody)

        // Check for async - either before factory() or in the factory function itself
        const preContext = content.slice(Math.max(0, index - 30), index)
        // Look for "async" either before factory() or right after the opening paren (async arrow/function)
        const isAsync = preContext.indexOf("async") !== -1 ||
                       factoryBody.indexOf("async") !== -1 && factoryBody.indexOf("async") < 50

        // Check for transient option
        const hasTransient = factoryBody.indexOf("transient") !== -1 &&
                            factoryBody.indexOf("true") !== -1

        // Try to find local variable name
        let localName
        const constPos = preContext.lastIndexOf("const")
        const letPos = preContext.lastIndexOf("let")
        const varPos = preContext.lastIndexOf("var")
        const declPos = Math.max(constPos, letPos, varPos)
        if (declPos !== -1) {
          const afterDecl = preContext.slice(declPos + 5) // skip "const" etc
          const ident = extractIdentifier(afterDecl, 0)
          if (ident) localName = ident.value
        }

        results.push({
          name: quoted.value,
          type: /** @type {"factory"} */ ("factory"),
          file,
          line,
          deps,
          localName,
          options: {
            async: isAsync,
            transient: hasTransient
          }
        })

        searchPos = quoted.endPos
      } else {
        searchPos = afterParen
      }
    }
  }

  // Look for inject(ClassName, ...)
  const injectTerm = "inject("
  let searchPos = 0

  while (true) {
    const index = content.indexOf(injectTerm, searchPos)
    if (index === -1) break

    if (index > 0 && isIdentChar(content[index - 1])) {
      searchPos = index + 1
      continue
    }

    const afterParen = index + injectTerm.length
    const classIdent = extractIdentifier(content, afterParen)

    if (classIdent) {
      const line = getLineNumber(content, index)

      // Find remaining arguments
      const closePos = findBalancedClose(content, index + 6) // "inject".length
      /** @type {D.DependencyRef[]} */
      const deps = []

      if (closePos > 0) {
        const argsStr = content.slice(classIdent.endPos, closePos)
        let pos = 0
        while (pos < argsStr.length) {
          pos = skipWhitespace(argsStr, pos)
          if (argsStr[pos] === ",") {
            pos++
            const ident = extractIdentifier(argsStr, pos)
            if (ident) {
              deps.push({ name: ident.value, type: "direct" })
              pos = ident.endPos
            }
          } else {
            pos++
          }
        }
      }

      results.push({
        name: classIdent.value,
        type: /** @type {"inject"} */ ("inject"),
        file,
        line,
        deps
      })

      searchPos = classIdent.endPos
    } else {
      searchPos = afterParen
    }
  }

  return results
}

/**
 * @param {string} body
 */
function findDepsInBody(body) {
  /** @type {D.DependencyRef[]} */
  const deps = []
  /** @type {Set<string>} */
  const seen = new Set()

  // Look for c.get( or container.get(
  for (const prefix of ["c.get(", "container.get("]) {
    let pos = 0
    while (true) {
      const index = body.indexOf(prefix, pos)
      if (index === -1) break

      const afterParen = index + prefix.length
      const ident = extractIdentifier(body, afterParen)

      if (ident && !seen.has(ident.value)) {
        seen.add(ident.value)
        deps.push({ name: ident.value, type: "direct" })
      }

      pos = afterParen
    }
  }

  // Look for lazy(c, identifier) or lazy(container, identifier)
  const lazyTerm = "lazy("
  let pos = 0
  while (true) {
    const index = body.indexOf(lazyTerm, pos)
    if (index === -1) break

    const afterParen = index + lazyTerm.length
    // Skip first argument (container)
    let p = skipWhitespace(body, afterParen)
    while (p < body.length && body[p] !== ",") p++
    if (body[p] === ",") {
      const ident = extractIdentifier(body, p + 1)
      if (ident && !seen.has(ident.value)) {
        seen.add(ident.value)
        deps.push({ name: ident.value, type: "lazy" })
      }
    }

    pos = afterParen
  }

  return deps
}

// ═══════════════════════════════════════════════════════════════════
// IMPORT DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {string} content
 * @param {string} file
 */
function findImports(content, file) {
  /** @type {D.ImportInfo[]} */
  const imports = []
  const importTerm = "import"
  let pos = 0

  while (true) {
    const index = content.indexOf(importTerm, pos)
    if (index === -1) break

    // Skip if part of larger word
    if (index > 0 && isIdentChar(content[index - 1])) {
      pos = index + 1
      continue
    }
    if (isIdentChar(content[index + importTerm.length])) {
      pos = index + 1
      continue
    }

    const line = getLineNumber(content, index)
    let p = index + importTerm.length
    p = skipWhitespace(content, p)

    // import * as name from '...'
    if (content[p] === "*") {
      p++
      p = skipWhitespace(content, p)
      if (content.slice(p, p + 2) === "as") {
        p += 2
        const ident = extractIdentifier(content, p)
        if (ident) {
          p = ident.endPos
          p = skipWhitespace(content, p)
          if (content.slice(p, p + 4) === "from") {
            p += 4
            const source = extractQuoted(content, p)
            if (source) {
              imports.push({
                localName: ident.value,
                importedName: "*",
                source: source.value,
                namespace: true,
                file,
                line
              })
              pos = source.endPos
              continue
            }
          }
        }
      }
    }

    // import { ... } from '...'
    if (content[p] === "{") {
      const closePos = content.indexOf("}", p)
      if (closePos === -1) {
        pos = p + 1
        continue
      }

      const namesStr = content.slice(p + 1, closePos)
      p = closePos + 1
      p = skipWhitespace(content, p)

      if (content.slice(p, p + 4) === "from") {
        p += 4
        const source = extractQuoted(content, p)
        if (source) {
          // Parse names
          const parts = namesStr.split(",")
          for (const part of parts) {
            const trimmed = part.trim()
            if (!trimmed) continue

            const asPos = trimmed.indexOf(" as ")
            if (asPos !== -1) {
              const importedName = trimmed.slice(0, asPos).trim()
              const localName = trimmed.slice(asPos + 4).trim()
              imports.push({
                localName,
                importedName,
                source: source.value,
                file,
                line
              })
            } else {
              imports.push({
                localName: trimmed,
                importedName: trimmed,
                source: source.value,
                file,
                line
              })
            }
          }

          pos = source.endPos
          continue
        }
      }
    }

    // import name from '...' (default)
    const ident = extractIdentifier(content, p)
    if (ident) {
      p = ident.endPos
      p = skipWhitespace(content, p)
      if (content.slice(p, p + 4) === "from") {
        p += 4
        const source = extractQuoted(content, p)
        if (source) {
          imports.push({
            localName: ident.value,
            importedName: "default",
            source: source.value,
            default: true,
            file,
            line
          })
          pos = source.endPos
          continue
        }
      }
    }

    pos = index + 1
  }

  return imports
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {string} content
 * @param {string} file
 */
function findExports(content, file) {
  /** @type {D.ExportInfo[]} */
  const exports = []
  const exportTerm = "export"
  let pos = 0

  while (true) {
    const index = content.indexOf(exportTerm, pos)
    if (index === -1) break

    // Skip if part of larger word
    if (index > 0 && isIdentChar(content[index - 1])) {
      pos = index + 1
      continue
    }

    let p = index + exportTerm.length
    p = skipWhitespace(content, p)

    // export * from '...'
    if (content[p] === "*") {
      p++
      p = skipWhitespace(content, p)
      if (content.slice(p, p + 4) === "from") {
        p += 4
        const source = extractQuoted(content, p)
        if (source) {
          exports.push({
            localName: "*",
            exportedAs: "*",
            file,
            reexport: true,
            sourceModule: source.value,
            wildcard: true
          })
          pos = source.endPos
          continue
        }
      }
    }

    // export { ... } or export { ... } from '...'
    if (content[p] === "{") {
      const closePos = content.indexOf("}", p)
      if (closePos === -1) {
        pos = p + 1
        continue
      }

      const namesStr = content.slice(p + 1, closePos)
      p = closePos + 1
      p = skipWhitespace(content, p)

      let sourceModule
      if (content.slice(p, p + 4) === "from") {
        p += 4
        const source = extractQuoted(content, p)
        if (source) {
          sourceModule = source.value
          p = source.endPos
        }
      }

      const parts = namesStr.split(",")
      for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed) continue

        const asPos = trimmed.indexOf(" as ")
        if (asPos !== -1) {
          const localName = trimmed.slice(0, asPos).trim()
          const exportedAs = trimmed.slice(asPos + 4).trim()
          exports.push({
            localName,
            exportedAs,
            file,
            reexport: !!sourceModule,
            sourceModule
          })
        } else {
          exports.push({
            localName: trimmed,
            exportedAs: trimmed,
            file,
            reexport: !!sourceModule,
            sourceModule
          })
        }
      }

      pos = p
      continue
    }

    // export default
    if (content.slice(p, p + 7) === "default") {
      p += 7
      const ident = extractIdentifier(content, p)
      exports.push({
        localName: ident ? ident.value : "default",
        exportedAs: "default",
        file
      })
      pos = p
      continue
    }

    // export const/let/var/function/class name
    for (const keyword of ["const", "let", "var", "function", "class", "async"]) {
      if (content.slice(p, p + keyword.length) === keyword) {
        p += keyword.length
        // Handle "async function"
        if (keyword === "async") {
          p = skipWhitespace(content, p)
          if (content.slice(p, p + 8) === "function") {
            p += 8
          }
        }
        const ident = extractIdentifier(content, p)
        if (ident) {
          exports.push({
            localName: ident.value,
            exportedAs: ident.value,
            file
          })
          pos = ident.endPos
        }
        break
      }
    }

    pos = index + 1
  }

  return exports
}

// ═══════════════════════════════════════════════════════════════════
// MAIN API
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {string} code
 * @param {string} filename
 * @returns {D.FileAnalysis}
 */
export function parseString(code, filename) {
  return {
    factories: findFactories(code, filename),
    imports: findImports(code, filename),
    exports: findExports(code, filename)
  }
}
