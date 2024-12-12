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

app.post('/png', async c => {
  // get text
  const text = await c.req.text()
  // log text
  console.info(text)
  // return 200
  return c.text('ok')
})

export default app
