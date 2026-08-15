import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = join(__dirname, 'dist')
const port = Number(process.env.PORT || 4173)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
  res.setHeader('Cache-Control', 'no-cache')

  let path = decodeURIComponent((req.url || '/').split('?')[0])
  if (path === '/') path = '/index.html'
  const file = join(root, path)

  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    // SPA fallback
    const index = join(root, 'index.html')
    res.writeHead(200, { 'Content-Type': types['.html'] })
    res.end(readFileSync(index))
    return
  }

  const ext = extname(file)
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' })
  res.end(readFileSync(file))
}).listen(port, '0.0.0.0', () => {
  console.log(`RaceLine serving dist on http://0.0.0.0:${port}`)
})
