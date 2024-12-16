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
  console.error(`Unexpected error: ${err}`)
  return c.text('Unexpected error', 500)
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
    console.error(`Invalid Content-Type: ${c.req.header('Content-Type')}`)
    return c.text('Invalid Content-Type', 400)
  }
  // get tex
  const tex = await c.req.text()
  // save file to temp directory
  const out = c.get('out')
  await Bun.write(`${out}/out.tex`, tex)
  // run pdflatex
  console.info('Generating PDF...')
  let text = 'Generating PDF...\n'
  const { stdout: pdfStdout, exitCode: pdfExitCode } =
    await $`pdflatex -halt-on-error -interaction=nonstopmode -output-directory ${out} ${out}/out.tex`
      .nothrow()
      .quiet()
  // check for errors: Dimension too large
  if (pdfStdout.includes('Dimension too large')) {
    console.error('Failed: Dimension too large')
    text += 'Failed: Dimension too large'
    return c.text(text)
  }
  // if exit code is not 0 or pdf does not exist
  if (pdfExitCode !== 0 || !(await Bun.file(`${out}/out.pdf`).exists())) {
    console.error('Failed: Unexpected error')
    text += 'Failed: Unexpected error'
    return c.text(text)
  }
  console.info('Done!')
  text += 'Done!\n'
  // convert pdf to png
  console.info('Generating PNG...')
  text += 'Generating PNG...\n'
  const { exitCode: pngExitCode } =
    await $`gs -dBATCH -dNOPAUSE -r600 -sDEVICE=pngmono -o "${out}/out.png" "${out}/out.pdf"`
      .nothrow()
      .quiet()
  // if exit code is not 0 or png does not exist
  if (pngExitCode !== 0 || !(await Bun.file(`${out}/out.png`).exists())) {
    console.error('Failed: Unexpected error')
    text += 'Failed: Unexpected error'
    return c.text(text)
  }
  console.info('Done!')
  // read png as buffer
  const buffer = await Bun.file(`${out}/out.png`).arrayBuffer()
  c.header('Content-Type', 'image/png')
  // c.header('Content-Length', buffer.byteLength.toString())
  // c.header('Content-Disposition', 'attachment; filename=out.png')
  return c.body(buffer)
})

export default app
