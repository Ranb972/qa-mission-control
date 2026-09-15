function getHttpStatusLabel(response: Response) {
  return typeof response.status === 'number'
    ? `HTTP ${response.status}`
    : 'unknown HTTP status'
}

function createRateLimitMessage(response?: Response) {
  const statusLabel =
    response && typeof response.status === 'number'
      ? ` (${getHttpStatusLabel(response)})`
      : ''

  return `AI provider rate limit reached${statusLabel}. Please wait and try again.`
}

export function createRateLimitedBackendResponseError(response?: Response) {
  return new Error(createRateLimitMessage(response))
}

export function createUnreadableBackendResponseError(
  serviceLabel: string,
  response: Response,
) {
  if (response.status === 429) {
    return createRateLimitedBackendResponseError(response)
  }

  const statusLabel = getHttpStatusLabel(response)

  return new Error(
    `${serviceLabel} backend did not return JSON (${statusLabel}). Start the local serverless backend for /api/ai routes; plain Vite does not serve them.`,
  )
}

export function createBackendErrorResponseError(
  response: Response,
  error: { code: string; message: string },
) {
  if (response.status === 429 || error.code === 'rate_limited') {
    return createRateLimitedBackendResponseError(response)
  }

  return new Error(error.message)
}
