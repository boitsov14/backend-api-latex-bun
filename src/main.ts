import { mkdtempSync, rmSync } from 'node:fs'
import { $ } from 'bun'
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
  return c.text(
    'An unexpected error occurred: Could not compile latex file',
    400,
  )
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
      rmSync(out, { recursive: true })
    }
  },
)

app.post('/png', tempDirMiddleware, async c => {
  // get multipart data
  const body = await c.req.parseBody()
  // get file
  const { file } = z.object({ file: z.instanceof(File) }).parse(body)
  // check file type
  if (!file.name.endsWith('.tex')) {
    return c.text('Invalid file type', 400)
  }
  // save file to temp directory
  const out = c.get('out')
  await Bun.write(`${out}/out.tex`, await file.arrayBuffer())
  // set response text
  let text = 'Generating PDF...\n'
  // run pdflatex
  const { stdout, exitCode } =
    await $`pdflatex -halt-on-error -interaction=nonstopmode -output-directory ${out} ${out}/out.tex`.nothrow()
  // log exit code
  console.info(`exit code: ${exitCode}`)
  // check for errors: Dimension too large
  if (stdout.includes('Dimension too large')) {
    text += 'Failed: Dimension too large.'
    return c.text(text, 400)
  }
  // if exit code is not 0 or pdf does not exist
  if (exitCode !== 0 || !(await Bun.file(`${out}/out.pdf`).exists())) {
    text += 'Failed: Unknown error.'
    return c.text(text, 400)
  }
  // return 200
  return c.text('ok')
})

export default app
