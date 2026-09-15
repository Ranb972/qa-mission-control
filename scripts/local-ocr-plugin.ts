import type { Plugin, ViteDevServer, PreviewServer } from 'vite'
import { handleOcrRequest } from '../api/documents/localOcr'

/** Local-only OCR bridge for dev/preview. Production functions use api/documents/ocr.ts. */
export function localOcrPlugin(): Plugin {
  const configure = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/api/documents/ocr', async (request, response) => {
      response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store')
      let body: unknown
      if (request.method === 'POST') {
        try {
          let size = 0; const chunks: Buffer[] = []
          for await (const chunk of request) {
            size += chunk.length
            if (size > 4300000) { response.statusCode = 413; response.end(JSON.stringify({ ok: false, error: 'Page image exceeds the 3 MB limit.' })); return }
            chunks.push(chunk)
          }
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch { response.statusCode = 400; response.end(JSON.stringify({ ok: false, error: 'Invalid page request.' })); return }
      }
      const result = await handleOcrRequest({ method: request.method, headers: request.headers, body })
      response.statusCode = result.status; response.end(JSON.stringify(result.body))
    })
  }
  return { name: 'local-page-ocr', configureServer: configure, configurePreviewServer: configure }
}
