import type { MapPortOptions, UnmapPortOptions } from './index.js'
import type { AbortOptions } from 'abort-error'

export interface Client {
  close(options?: AbortOptions): Promise<void>
  map(options: MapPortOptions): Promise<void>
  unmap(options: UnmapPortOptions): Promise<void>
  externalIp(options?: AbortOptions): Promise<string>
}
