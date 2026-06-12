import 'dotenv/config'
import { createApp } from './app'

const port = Number(process.env.PORT ?? 8787)
const app = createApp(undefined, undefined, { serveStaticFrontend: process.env.SERVE_STATIC_FRONTEND !== 'false' })

app.listen(port, () => {
  console.log(`Local Growth OS listening on http://127.0.0.1:${port}`)
})
