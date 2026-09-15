import { importApiContract } from './apiContractImport'
import { importRepositoryEvidence } from './repositoryImport'
import { projectionDocumentImport } from './productProjection'
self.onmessage = async (event: MessageEvent<{ kind: 'api' | 'repository'; inputs: { name: string; text: string }[] }>) => {
  try {
    const projection = event.data.kind === 'api' ? await importApiContract(event.data.inputs[0]) : await importRepositoryEvidence(event.data.inputs)
    self.postMessage({ ok: true, content: projection.content, imported: await projectionDocumentImport(projection) })
  } catch (reason) {
    // Only app-owned parser errors are used; no JSON.parse/native error details.
    const message = reason instanceof Error ? reason.message : 'Product evidence could not be prepared.'
    self.postMessage({ ok: false, error: message.length <= 250 && /^(?:Choose|Select|Each|This|The |An |No |A |Only)/.test(message) ? message : 'Product evidence could not be prepared safely. No saved source changed.' })
  }
}
