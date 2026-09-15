import { handleOcrRequest } from './localOcr'
export default async function handler(request: Parameters<typeof handleOcrRequest>[0], response: { status: (code: number) => { json: (body: unknown) => void } }) {
  const result = await handleOcrRequest(request)
  response.status(result.status).json(result.body)
}
