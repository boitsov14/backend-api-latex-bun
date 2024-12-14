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
  return c.text('Unknown error', 400)
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
  // validate data
  const result = z
    .object({
      file: z.instanceof(File).refine(file => file.name === 'out.tex'),
    })
    .safeParse(body)
  if (!result.success) {
    console.error(result.error)
    return c.text('Invalid request', 400)
  }
  // save file to temp directory
  const out = c.get('out')
  await Bun.write(`${out}/out.tex`, await result.data.file.arrayBuffer())
  // set response text
  let text = 'Generating PDF...\n'
  // run pdflatex
  const { stdout: pdfStdout, exitCode: pdfExitCode } =
    await $`pdflatex -halt-on-error -interaction=nonstopmode -output-directory ${out} ${out}/out.tex`.nothrow()
  // log exit code
  console.info(`exit code: ${pdfExitCode}`)
  // check for errors: Dimension too large
  if (pdfStdout.includes('Dimension too large')) {
    text += 'Failed: Dimension too large.'
    return c.text(text)
  }
  // if exit code is not 0 or pdf does not exist
  if (pdfExitCode !== 0 || !(await Bun.file(`${out}/out.pdf`).exists())) {
    text += 'Failed: Unknown error.'
    return c.text(text)
  }
  // convert pdf to png
  const { exitCode: pngExitCode } =
    await $`gs -dBATCH -dNOPAUSE -r600 -sDEVICE=pngmono -o "${out}/out.png" "${out}/out.pdf"`
  // log exit code
  console.info(`exit code: ${pngExitCode}`)
  // if exit code is not 0 or png does not exist
  if (pngExitCode !== 0 || !(await Bun.file(`${out}/out.png`).exists())) {
    text += 'Failed: Unknown error.'
    return c.text(text)
  }
  // return 200
  return c.text('ok')
})

export default app
