const DEFAULT_LIMIT = 10_000
const WINDOW_MS = 60_000

interface Bucket {
  count: number
  resetAt: number
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>()
  private limit: number
  private cleanupTimer: ReturnType<typeof setInterval>

  constructor(limit?: number) {
    this.limit = limit ?? (parseInt(process.env.FLUXORY_RATE_LIMIT ?? '', 10) || DEFAULT_LIMIT)
    this.cleanupTimer = setInterval(() => this.cleanup(), WINDOW_MS)
  }

  allow(ip: string): boolean {
    if (this.limit <= 0) return true

    const now = Date.now()
    let bucket = this.buckets.get(ip)

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + WINDOW_MS }
      this.buckets.set(ip, bucket)
    }

    bucket.count++
    return bucket.count <= this.limit
  }

  remaining(ip: string): number {
    const bucket = this.buckets.get(ip)
    if (!bucket || Date.now() >= bucket.resetAt) return this.limit
    return Math.max(0, this.limit - bucket.count)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [ip, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(ip)
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer)
  }
}
