/**
 * Free-text search helpers.
 *
 * Every list endpoint that accepts a `search` parameter builds its LIKE pattern here.
 */

/**
 * Escape a user-supplied string for safe use inside a LIKE / ILIKE pattern.
 *
 * `%` and `_` are wildcards in SQL pattern matching, so interpolating raw user input
 * makes them *operators* rather than characters. The practical consequences are wrong
 * results, not injection — Drizzle still parameterises the value — but they are wrong in
 * a way an operator would report as a bug:
 *
 *   searching `50%`  matched every row, because `%` means "anything"
 *   searching `a_b`  matched `axb`, because `_` means "any single character"
 *
 * The backslash is escaped first, otherwise escaping the wildcards would double-escape
 * any backslash the user actually typed.
 *
 * Postgres uses `\` as the default LIKE escape character, so no explicit ESCAPE clause is
 * required.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/** Wrap an escaped term for a "contains" match. */
export function containsPattern(value: string): string {
  return `%${escapeLikePattern(value)}%`
}
