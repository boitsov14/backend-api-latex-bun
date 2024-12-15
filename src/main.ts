import { mkdtempSync, rmSync } from 'node:fs'
import { $ } from 'bun'
import { createMiddleware } from 'hono/factory'
import { logger } from 'hono/logger'
import { Hono } from 'hono/quick'

const app = new Hono()
// log requests
app.use(logger())
// handle errors
app.onError((err, c) => {
  console.error(err)
  return c.text('Unexpected error', 400)
})
// create temp dir
// biome-ignore lint/style/useNamingConvention:
const tempDirMiddleware = createMiddleware<{ Variables: { out: string } }>(
  async (c, next) => {
    // create temp dir
    const out = mkdtempSync('out-')
    c.set('out', out)
    try {
      await next()
    } finally {
      // remove temp dir
      rmSync(out, { recursive: true })
    }
  },
)

app.post('/png', tempDirMiddleware, async c => {
  // check Content-Type is application/x-tex
  if (c.req.header('Content-Type') !== 'application/x-tex') {
    const text = 'Invalid Content-Type'
    console.error(text)
    return c.text(text, 400)
  }
  // get tex
  const tex = await c.req.text()
  // save file to temp directory
  const out = c.get('out')
  await Bun.write(`${out}/out.tex`, tex)
  // set response text
  let text = 'Generating PDF...\n'
  // run pdflatex
  const { stdout: pdfStdout, exitCode: pdfExitCode } =
    await $`pdflatex -halt-on-error -interaction=nonstopmode -output-directory ${out} ${out}/out.tex`
      .nothrow()
      .quiet()
  // log exit code
  console.info(`exit code: ${pdfExitCode}`)
  // check for errors: Dimension too large
  if (pdfStdout.includes('Dimension too large')) {
    text += 'Failed: Dimension too large.'
    return c.text(text)
  }
  // if exit code is not 0 or pdf does not exist
  if (pdfExitCode !== 0 || !(await Bun.file(`${out}/out.pdf`).exists())) {
    text += 'Failed: Unexpected error.'
    return c.text(text)
  }
  text += 'Generating PNG...\n'
  // convert pdf to png
  const { exitCode: pngExitCode } =
    await $`gs -dBATCH -dNOPAUSE -r600 -sDEVICE=pngmono -o "${out}/out.png" "${out}/out.pdf"`
      .nothrow()
      .quiet()
  // log exit code
  console.info(`exit code: ${pngExitCode}`)
  // if exit code is not 0 or png does not exist
  if (pngExitCode !== 0 || !(await Bun.file(`${out}/out.png`).exists())) {
    text += 'Failed: Unexpected error.'
    return c.text(text)
  }
  // read png as buffer
  const buffer = await Bun.file(`${out}/out.png`).arrayBuffer()
  c.header('Content-Type', 'image/png')
  // c.header('Content-Length', buffer.byteLength.toString())
  // c.header('Content-Disposition', 'attachment; filename=out.png')
  return c.body(buffer)
})

export default app
