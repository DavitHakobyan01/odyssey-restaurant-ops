/**
 * Cloudflare Worker entry point.
 *
 * Intentionally trivial: all assembly lives in `app.ts` so the exact same application
 * can be constructed by tests and by the OpenAPI emitter without a Worker runtime.
 */
import { createApp } from './app'

const app = createApp()

export default app
