import { parseUnitResponse, readBoundedJson, UNIT_ANALYSIS_ENDPOINT, UNIT_RESPONSE_BYTES, unitFailure, type UnitRequest, type UnitResponse } from './unitAnalysisContract'

export async function analyzeDocumentUnit(request: UnitRequest, signal: AbortSignal): Promise<UnitResponse> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) controller.abort()
  const timeout = setTimeout(abort, 70_000)
  try {
    const response = await fetch(UNIT_ANALYSIS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal: controller.signal, credentials: 'omit', redirect: 'error' })
    if ([429, 408, 504].includes(response.status)) { await response.body?.cancel(); return unitFailure(response.status === 429 ? 'rate_limited' : 'timeout') }
    if ([401, 403, 404].includes(response.status)) { await response.body?.cancel(); return unitFailure('configuration') }
    try { return parseUnitResponse(await readBoundedJson(response, UNIT_RESPONSE_BYTES), request.text) }
    catch { return unitFailure(controller.signal.aborted ? 'timeout' : response.status >= 500 ? 'temporary' : 'invalid_response') }
  } catch { return unitFailure(controller.signal.aborted ? 'timeout' : 'temporary') }
  finally { clearTimeout(timeout); signal.removeEventListener('abort', abort) }
}
