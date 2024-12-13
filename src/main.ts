import { mkdtempSync, rmSync } from 'node:fs'
import { createMiddleware } from 'hono/factory'
import { logger } from 'hono/logger'
import { Hono } from 'hono/quick'
import { z } from 'zod'

const app = new Hono()
// log requests
app.use(logger())
// handle errors
app.onError((err, c) => {
  console.error(err)
  return c.text('An unexpected error occurred', 500)
})
// create temp dir
// biome-ignore lint/style/useNamingConvention:
const tempDirMiddleware = createMiddleware<{ Variables: { out: string } }>(
  async (c, next) => {
    // create temp dir
    const out = mkdtempSync('out-')
    try {
      c.set('out', out)
      await next()
    } finally {
      // remove temp dir
      rmSync(out)
    }
  },
)

app.post('/png', tempDirMiddleware, async c => {
  // get multipart data
  const body = await c.req.parseBody()
  // get file
  const { file } = z.object({ file: z.instanceof(File) }).parse(body)
  // save file to temp directory
  await Bun.write(`${c.get('out')}/${file.name}`, await file.arrayBuffer())
  // return 200
  return c.text('ok')
})

export default app
