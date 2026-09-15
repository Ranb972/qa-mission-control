const encoder = new TextEncoder()

/** SHA-256 avoids using the legacy display-oriented short hashes as durable evidence authority. */
export async function fingerprint(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function utf8Length(value: string): number {
  return encoder.encode(value).byteLength
}
