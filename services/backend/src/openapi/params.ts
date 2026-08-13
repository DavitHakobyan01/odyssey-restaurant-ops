/**
 * Path parameter schemas.
 *
 * OpenAPI needs the parameter's *name* and *location* as metadata, which zod alone does
 * not carry — hence the `.openapi({ param })` annotation. Centralising it means every
 * `/:id` route documents itself identically and Orval generates consistent hook
 * signatures across resources.
 */
import { z } from './registry'

const EXAMPLE_UUID = '3f1c1c9e-1a2b-4c3d-8e5f-6a7b8c9d0e1f'

/** `{id}` path parameter, validated as a UUID before the handler ever runs. */
export const IdParamSchema = z.object({
  id: z.uuid().openapi({
    param: { name: 'id', in: 'path', required: true },
    example: EXAMPLE_UUID,
    description: 'Resource identifier.',
  }),
})

/** `{id}` for nested routes where the parent is explicit, e.g. /orders/{id}/transition. */
export const OrderIdParamSchema = z.object({
  id: z.uuid().openapi({
    param: { name: 'id', in: 'path', required: true },
    example: EXAMPLE_UUID,
    description: 'Order identifier.',
  }),
})
