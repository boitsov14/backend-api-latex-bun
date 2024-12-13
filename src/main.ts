import { mkdtempSync, rmSync } from 'node:fs'
import { createMiddleware } from 'hono/factory'
import { logger } from 'hono/logger'
import { Hono } from 'hono/quick'

const app = new Hono()
// log requests
app.use(logger())
// handle errors
app.onError((err, c) => {
  console.error(err)
  return c.text('An unexpected error occurred', 500)
})
// create temp dir
app.use(
  // biome-ignore lint/style/useNamingConvention:
  createMiddleware<{ Variables: { out: string } }>(async (c, next) => {
    // create temp dir
    const out = mkdtempSync('out-')
    try {
      c.set('out', out)
      await next()
    } finally {
      // remove temp dir
      rmSync(out)
    }
  }),
)
app.post('/png', async c => {
  // get text
  const text = await c.req.text()
  // log text
  console.info(text)
  // return 200
  return c.text('ok')
})

export default app
