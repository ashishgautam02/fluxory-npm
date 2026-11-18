import { spawn } from 'child_process'
import http from 'http'
import type { FluxoryConfig } from '@fluxory/core'

function checkPort(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, () => resolve(true))
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => { req.destroy(); resolve(false) })
  })
}

function findDashboardBin(): string | null {
  try {
    return require.resolve('@fluxory/dashboard/bin/fluxory.js')
  } catch {
    return null
  }
}

export async function maybeStartDashboard(config: FluxoryConfig): Promise<void> {
  if (!config.dashboard || !config.enabled) return

  const alive = await checkPort(`${config.collectorUrl}/api/auth/status`)
  if (alive) {
    if (config.debug) console.log(`[fluxory] dashboard already running at ${config.collectorUrl}`)
    return
  }

  const bin = findDashboardBin()
  if (!bin) {
    if (config.debug) console.log('[fluxory] @fluxory/dashboard not installed, skipping auto-start')
    return
  }

  const env: Record<string, string> = { ...process.env as Record<string, string> }
  if (config.apiKey) env.FLUXORY_API_KEY = config.apiKey

  const child = spawn(process.execPath, [bin], {
    detached: true,
    stdio: 'ignore',
    env,
  })
  child.unref()

  if (config.debug) console.log(`[fluxory] started dashboard (pid ${child.pid}) at ${config.collectorUrl}`)
}
