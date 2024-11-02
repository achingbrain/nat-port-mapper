import type { AbortOptions } from 'abort-error'

export interface Client {
  close(options?: AbortOptions): Promise<void>
  map(localPort: number, options: InternalMapOptions): Promise<void>
  unmap(localPort: number, options: InternalMapOptions): Promise<void>
  externalIp(options?: AbortOptions): Promise<string>
}

export interface InternalMapOptions extends AbortOptions {
  publicPort: number
  publicHost: string
  localAddress: string
  protocol: 'TCP' | 'UDP'
  description: string
  ttl: number
  gateway?: string
}
