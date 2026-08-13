/**
 * Emits `openapi.json` from the live application definition.
 *
 * This is step three of the contract pipeline:
 *
 *   Drizzle schema -> drizzle-zod -> Hono/OpenAPI -> [emit] -> Orval -> frontend hooks
 *
 * The document is produced by constructing the real app and asking it to describe
 * itself. It is therefore impossible for the committed artifact to describe routes that
 * do not exist, or to miss routes that do — the usual failure mode of a hand-maintained
 * spec. Run via `pnpm gen:contract`, which then feeds Orval.
 *
 * The output is committed so that reviewers can read the API surface as a diff, and so
 * the dashboard can be regenerated without a running backend.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createApp, openApiConfig } from '../src/app'

const here = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(here, '../openapi.json')

const app = createApp()
const document = app.getOpenAPI31Document(openApiConfig)

mkdirSync(dirname(outputPath), { recursive: true })
// Trailing newline keeps the file diff-friendly and POSIX-clean.
writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')

const pathCount = Object.keys(document.paths ?? {}).length
const schemaCount = Object.keys(document.components?.schemas ?? {}).length
const operationCount = Object.values(document.paths ?? {}).reduce(
  (total, pathItem) =>
    total +
    Object.keys(pathItem ?? {}).filter((key) =>
      ['get', 'post', 'put', 'patch', 'delete'].includes(key),
    ).length,
  0,
)

console.log(
  `openapi.json written: ${pathCount} paths, ${operationCount} operations, ${schemaCount} component schemas`,
)
