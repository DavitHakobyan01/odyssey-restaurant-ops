/**
 * Reusable OpenAPI response definitions.
 *
 * Declaring error responses once and spreading them into route definitions means the
 * generated document (and therefore the generated client) knows every failure shape a
 * route can produce. Without this, Orval would type error branches as `unknown` and the
 * dashboard would have no typed way to distinguish "item unavailable" from "not found".
 */
import type { z } from '@hono/zod-openapi'

import { ApiErrorSchema } from './registry'

/** A 2xx JSON body. */
export function jsonContent<T extends z.ZodType>(schema: T, description: string) {
  return {
    content: { 'application/json': { schema } },
    description,
  }
}

const errorResponse = (description: string) => ({
  content: { 'application/json': { schema: ApiErrorSchema } },
  description,
})

/** Attached to every route: malformed input and unexpected failure are always possible. */
export const baseErrorResponses = {
  400: errorResponse('The request failed schema validation.'),
  500: errorResponse('Unexpected server error.'),
} as const

/** For routes addressing a specific resource by id. */
export const notFoundResponse = {
  404: errorResponse('The requested resource does not exist.'),
} as const

/** For routes that can conflict with current state. */
export const conflictResponse = {
  409: errorResponse('The request conflicts with the current state of the resource.'),
} as const

/** For routes that enforce business rules on an otherwise well-formed request. */
export const unprocessableResponse = {
  422: errorResponse('The request is well-formed but violates a business rule.'),
} as const
