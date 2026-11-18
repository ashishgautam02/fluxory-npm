const HEX = '0123456789abcdef'

function randomHex(length: number): string {
  let result = ''
  const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(length / 2))
    : null

  if (bytes) {
    for (let i = 0; i < bytes.length; i++) {
      result += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0xf]
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += HEX[Math.floor(Math.random() * 16)]
    }
  }
  return result
}

export function generateTraceId(): string {
  return randomHex(32)
}

export function generateSpanId(): string {
  return randomHex(16)
}

export function parseTraceparent(header: string): { traceId: string; spanId: string } | null {
  const parts = header.split('-')
  if (parts.length < 4 || parts[0] !== '00') return null
  return { traceId: parts[1], spanId: parts[2] }
}

export function formatTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`
}

export function shortId(id: string): string {
  return id.slice(0, 8)
}
