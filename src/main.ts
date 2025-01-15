import { mkdtempSync, rmSync } from 'node:fs'
import { $ } from 'bun'
import { createMiddleware } from 'hono/factory'
import { logger } from 'hono/logger'
import { Hono } from 'hono/quick'
import sizeOf from 'image-size'

const PNG_MAX_DIMENSION = 8192

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

app.post('/svg', tempDirMiddleware, async c => {
  // get tex
  const tex = await c.req.text()
  // get temp
  const out = c.get('out')
  // save as file
  await Bun.write(`${out}/out.tex`, tex)
  // run latex
  console.info('Generating DVI...')
  let text = 'Generating DVI...\n'
  const { stdout } =
    await $`latex -halt-on-error -interaction=nonstopmode -output-directory ${out} ${out}/out.tex`.nothrow()
  // Dimension too large
  if (stdout.includes('Dimension too large')) {
    text += 'Failed: Dimension too large'
    console.warn(text)
    return c.text(text)
  }
  // if dvi does not exist
  if (!(await Bun.file(`${out}/out.dvi`).exists())) {
    text += 'Failed: Unexpected error\nNo DVI generated'
    console.error(text)
    return c.text(text)
  }
  console.info('Done!')
  text += 'Done!\n'
  // run dvisvgm
  console.info('Generating SVG...')
  text += 'Generating SVG...\n'
  await $`dvisvgm --bbox=preview --bitmap-format=none --font-format=woff2 --optimize --relative -o "${out}/out.svg" "${out}/out.dvi"`.nothrow()
  // if svg does not exist
  if (!(await Bun.file(`${out}/out.svg`).exists())) {
    text += 'Failed: Unexpected error\nNo SVG generated'
    console.error(text)
    return c.text(text)
  }
  console.info('Done!')
  // read svg as buffer
  const buffer = await Bun.file(`${out}/out.svg`).arrayBuffer()
  console.info(`Size: ${buffer.byteLength} bytes`)
  c.header('Content-Type', 'image/svg+xml')
  // c.header('Content-Length', buffer.byteLength.toString())
  // c.header('Content-Disposition', 'attachment; filename=out.svg')
  return c.body(buffer)
})

app.post('/png', tempDirMiddleware, async c => {
  // get tex
  const tex = await c.req.text()
  // get temp
  const out = c.get('out')
  // save as file
  await Bun.write(`${out}/out.tex`, tex)
  // run pdflatex
  console.info('Generating PDF...')
  let text = 'Generating PDF...\n'
  const { stdout } =
    await $`pdflatex -halt-on-error -interaction=nonstopmode -output-directory ${out} ${out}/out.tex`.nothrow()
  // Dimension too large
  if (stdout.includes('Dimension too large')) {
    text += 'Failed: Dimension too large'
    console.warn(text)
    return c.text(text)
  }
  // if pdf does not exist
  if (!(await Bun.file(`${out}/out.pdf`).exists())) {
    text += 'Failed: Unexpected error\nNo PDF generated'
    console.error(text)
    return c.text(text)
  }
  console.info('Done!')
  text += 'Done!\n'
  // convert pdf to png
  console.info('Generating PNG...')
  text += 'Generating PNG...\n'
  for (const dpi of [600, 300, 150, 100, 50, 2]) {
    await $`gs -dBATCH -dNOPAUSE -r${dpi} -sDEVICE=pngmono -o "${out}/out.png" "${out}/out.pdf"`.nothrow()
    // if png does not exist
    if (!(await Bun.file(`${out}/out.png`).exists())) {
      text += 'Failed: Unexpected error\nNo PNG generated'
      console.error(text)
      return c.text(text)
    }
    console.info('Done!')
    // check dimensions
    const dimensions = sizeOf(`${out}/out.png`)
    console.info(`${dpi} DPI: ${dimensions.width}x${dimensions.height}`)
    if (
      dimensions.width &&
      dimensions.width <= PNG_MAX_DIMENSION &&
      dimensions.height &&
      dimensions.height <= PNG_MAX_DIMENSION
    ) {
      // read png as buffer
      const buffer = await Bun.file(`${out}/out.png`).arrayBuffer()
      console.info(`Size: ${buffer.byteLength} bytes`)
      c.header('Content-Type', 'image/png')
      // c.header('Content-Length', buffer.byteLength.toString())
      // c.header('Content-Disposition', 'attachment; filename=out.png')
      return c.body(buffer)
    }
  }
  text += 'Failed: Unexpected error\nPNG too large'
  console.error(text)
  return c.text(text)
})

app.post('/pdf', tempDirMiddleware, async c => {
  // get tex
  const tex = await c.req.text()
  // get temp
  const out = c.get('out')
  // save as file
  await Bun.write(`${out}/out.tex`, tex)
  // run pdflatex
  console.info('Generating PDF...')
  let text = 'Generating PDF...\n'
  const { stdout } =
    await $`pdflatex -halt-on-error -interaction=nonstopmode -output-directory ${out} ${out}/out.tex`.nothrow()
  // Dimension too large
  if (stdout.includes('Dimension too large')) {
    text += 'Failed: Dimension too large'
    console.warn(text)
    return c.text(text)
  }
  // if pdf does not exist
  if (!(await Bun.file(`${out}/out.pdf`).exists())) {
    text += 'Failed: Unexpected error\nNo PDF generated'
    console.error(text)
    return c.text(text)
  }
  console.info('Done!')
  text += 'Done!\n'
  // compress pdf
  console.info('Compressing PDF...')
  text += 'Compressing PDF...\n'
  await $`gs -dBATCH -dCompatibilityLevel=1.5 -dNOPAUSE -sDEVICE=pdfwrite -o "${out}/out-comp.pdf" "${out}/out.pdf"`.nothrow()
  // if compressed pdf does not exist
  if (!(await Bun.file(`${out}/out-comp.pdf`).exists())) {
    text += 'Failed: Unexpected error\nNo compressed PDF generated'
    console.error(text)
    return c.text(text)
  }
  console.info('Done!')
  // read compressed pdf as buffer
  const buffer = await Bun.file(`${out}/out-comp.pdf`).arrayBuffer()
  console.info(`Size: ${buffer.byteLength} bytes`)
  c.header('Content-Type', 'application/pdf')
  // c.header('Content-Length', buffer.byteLength.toString())
  // c.header('Content-Disposition', 'attachment; filename=out.pdf')
  return c.body(buffer)
})

export default {
  port: 3001,
  fetch: app.fetch,
}
