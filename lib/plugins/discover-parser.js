/**
 * Parser utilities for factory discovery.
 *
 * This module provides simple string-based parsing for discovering factory definitions.
 * It deliberately avoids regex and external dependencies to keep things simple.
 *
 * For production use with complex codebases, consider using a real parser like acorn:
 *
 * @example
 * import { parse } from 'acorn'
 * import { simple } from 'acorn-walk'
 *
 * const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' })
 * simple(ast, {
 *   CallExpression(node) {
 *     if (node.callee.name === 'factory') {
 *       // Extract factory info from AST
 *     }
 *   }
 * })
 */

/** @import * as ParserTypes from './discover-parser.js' */

// === String Helpers ===

/** @type {ParserTypes.StringHelpers} */
export const StringHelpers = {
  /**
   * Skip whitespace characters from position
   * @param {string} str
   * @param {number} pos
   * @returns {number}
   */
  skipWhitespace(str, pos) {
    while (pos < str.length && " \t\n\r".includes(str[pos])) {
      pos++
    }
    return pos
  },

  /**
   * Find closing bracket accounting for nesting
   * @param {string} str
   * @param {number} openPos
   * @param {string} openChar
   * @param {string} closeChar
   * @returns {number} Position of closing bracket or -1
   */
  findBalancedClose(str, openPos, openChar = "{", closeChar = "}") {
    let depth = 1
    let pos = openPos + 1
    while (pos < str.length && depth > 0) {
      if (str[pos] === openChar) depth++
      else if (str[pos] === closeChar) depth--
      if (depth > 0) pos++
    }
    return depth === 0 ? pos : -1
  },

  /**
   * Extract content between quotes starting from position
   * @param {string} str
   * @param {number} startPos
   * @returns {{ value: string, endPos: number } | null}
   */
  extractQuoted(str, startPos) {
    let pos = startPos
    while (pos < str.length && str[pos] !== '"' && str[pos] !== "'") {
      if (!" \t\n\r(".includes(str[pos])) {
        return null
      }
      pos++
    }
    if (pos >= str.length) return null

    const quote = str[pos]
    const contentStart = pos + 1
    const contentEnd = str.indexOf(quote, contentStart)
    if (contentEnd === -1) return null

    return {
      value: str.slice(contentStart, contentEnd),
      endPos: contentEnd + 1,
    }
  },

  /**
   * Check if character is a valid identifier character
   * @param {string} c
   * @returns {boolean}
   */
  isIdentChar(c) {
    return (
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z") ||
      (c >= "0" && c <= "9") ||
      c === "_" ||
      c === "$"
    )
  },

  /**
   * Extract identifier (word) starting from position
   * @param {string} str
   * @param {number} startPos
   * @returns {{ value: string, endPos: number } | null}
   */
  extractIdentifier(str, startPos) {
    let pos = startPos
    while (pos < str.length && !this.isIdentChar(str[pos])) pos++

    const start = pos
    while (pos < str.length && this.isIdentChar(str[pos])) pos++

    return pos > start ? { value: str.slice(start, pos), endPos: pos } : null
  },
}

// === Pattern Finders ===

/**
 * @typedef {Object} DiscoveredFactory
 * @property {string} name
 * @property {string} file
 * @property {string} type
 * @property {boolean} async
 */

/**
 * Find factory("Name", ...) or named("Name", ...) calls
 * @param {string} content
 * @param {string} filePath
 * @param {string} functionName
 * @returns {DiscoveredFactory[]}
 */
export function findFunctionCalls(content, filePath, functionName) {
  /** @type {DiscoveredFactory[]} */
  const results = []
  const searchTerm = functionName + "("
  let searchPos = 0

  while (true) {
    const index = content.indexOf(searchTerm, searchPos)
    if (index === -1) break

    if (index > 0 && StringHelpers.isIdentChar(content[index - 1])) {
      searchPos = index + 1
      continue
    }

    const afterParen = index + searchTerm.length
    const afterWhitespace = StringHelpers.skipWhitespace(content, afterParen)

    const quoted = StringHelpers.extractQuoted(content, afterWhitespace)
    if (quoted) {
      const contextStart = Math.max(0, index - 100)
      const context = content.slice(contextStart, index + 200)
      const isAsync = context.includes("async")

      results.push({
        name: quoted.value,
        file: filePath,
        type: functionName + "()",
        async: isAsync,
      })
      searchPos = quoted.endPos
    } else {
      searchPos = afterParen
    }
  }

  return results
}

/**
 * Find JSDoc Factory type annotations
 * @param {string} content
 * @param {string} filePath
 * @returns {DiscoveredFactory[]}
 */
export function findFactoryJSDoc(content, filePath) {
  /** @type {DiscoveredFactory[]} */
  const results = []
  const marker = "@type"
  let searchPos = 0

  while (true) {
    const typeIndex = content.indexOf(marker, searchPos)
    if (typeIndex === -1) break

    const braceStart = content.indexOf("{", typeIndex)
    if (braceStart === -1 || braceStart > typeIndex + 20) {
      searchPos = typeIndex + marker.length
      continue
    }

    const braceEnd = StringHelpers.findBalancedClose(content, braceStart, "{", "}")
    if (braceEnd === -1) {
      searchPos = braceStart + 1
      continue
    }

    const typeContent = content.slice(braceStart + 1, braceEnd)

    const factoryIndex = typeContent.indexOf("Factory<")
    if (factoryIndex === -1) {
      searchPos = braceEnd + 1
      continue
    }

    const typeParamStart = factoryIndex + "Factory<".length
    const typeParamEnd = StringHelpers.findBalancedClose(
      typeContent,
      factoryIndex + "Factory".length,
      "<",
      ">"
    )

    if (typeParamEnd === -1) {
      searchPos = braceEnd + 1
      continue
    }

    const typeParam = typeContent.slice(typeParamStart, typeParamEnd).trim()

    const afterBrace = content.slice(braceEnd + 1, braceEnd + 101)
    const constIndex = afterBrace.indexOf("const")

    if (constIndex !== -1) {
      const identifier = StringHelpers.extractIdentifier(afterBrace, constIndex + "const".length)

      if (identifier) {
        results.push({
          name: identifier.value,
          file: filePath,
          type: "Factory<" + typeParam + ">",
          async: typeParam.includes("Promise"),
        })
      }
    }

    searchPos = braceEnd + 1
  }

  return results
}

/**
 * @typedef {Object} ImportInfo
 * @property {string[]} names
 * @property {string} source
 */

/**
 * Find import { ... } from "./..." statements
 * @param {string} content
 * @returns {ImportInfo[]}
 */
export function findImports(content) {
  /** @type {ImportInfo[]} */
  const imports = []
  const marker = "import"
  let searchPos = 0

  while (true) {
    const importIndex = content.indexOf(marker, searchPos)
    if (importIndex === -1) break

    if (importIndex > 0 && StringHelpers.isIdentChar(content[importIndex - 1])) {
      searchPos = importIndex + 1
      continue
    }

    const braceStart = content.indexOf("{", importIndex)
    if (braceStart === -1 || braceStart > importIndex + 20) {
      searchPos = importIndex + marker.length
      continue
    }

    const braceEnd = content.indexOf("}", braceStart)
    if (braceEnd === -1) {
      searchPos = braceStart + 1
      continue
    }

    const namesStr = content.slice(braceStart + 1, braceEnd)
    const names = namesStr
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
      .map((n) => {
        const asIndex = n.indexOf(" as ")
        return asIndex !== -1 ? n.slice(0, asIndex).trim() : n
      })

    const fromIndex = content.indexOf("from", braceEnd)
    if (fromIndex === -1 || fromIndex > braceEnd + 20) {
      searchPos = braceEnd + 1
      continue
    }

    const quoted = StringHelpers.extractQuoted(content, fromIndex + "from".length)
    if (quoted && (quoted.value.startsWith("./") || quoted.value.startsWith("../"))) {
      imports.push({ names, source: quoted.value })
      searchPos = quoted.endPos
    } else {
      searchPos = fromIndex + "from".length
    }
  }

  return imports
}
