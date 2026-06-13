import 'dotenv/config'
import { createApp } from './app'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '127.0.0.1'
const apiOnly = process.argv.includes('--api-only') || process.env.npm_lifecycle_event === 'api'
const serveStaticFrontend =
  apiOnly
    ? false
    : process.env.SERVE_STATIC_FRONTEND === undefined
      ? true
    : process.env.SERVE_STATIC_FRONTEND !== 'false'
const app = createApp(undefined, undefined, { serveStaticFrontend })

const server = app.listen(port, host, () => {
  console.log(`Local Growth OS listening on http://${host}:${port}`)
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the existing API process or set PORT to another value.`)
    process.exitCode = 1
    return
  }

  console.error(error)
  process.exitCode = 1
})
