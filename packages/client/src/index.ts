import { type DeepPartial, type FluxoryConfig, createTracker } from '@fluxory/core'
import { initClient, getTransport } from './config'
import { patchFetch } from './interceptors/fetch'
import { patchXHR } from './interceptors/xhr'
import { patchClicks } from './interceptors/clicks'
import { patchNavigation } from './interceptors/navigation'
import { patchAxios } from './interceptors/axios'

export { initClient } from './config'

export const fluxory = createTracker(() => getTransport())
export type { FluxoryTracker, TrackerSpan, TraceOptions } from '@fluxory/core'

let initialized = false

export function init(opts?: DeepPartial<FluxoryConfig>): void {
  if (initialized) return
  initialized = true

  initClient(opts)
  patchFetch()
  patchXHR()
  patchClicks()
  patchNavigation()
  patchAxios()
}

if (typeof window !== 'undefined') {
  init()
}
