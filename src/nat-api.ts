import os from 'os'
import { logger } from '@libp2p/logger'
import type { MapPortOptions, NatAPIOptions } from './index.js'
import type { Client, InternalMapOptions } from './types.js'
import type { AbortOptions } from 'abort-error'

const log = logger('nat-port-mapper')

export class NatAPI {
  public openPorts: Map<number, InternalMapOptions>
  private readonly ttl: number
  private readonly description: string
  private readonly gateway?: string
  private readonly keepAlive: boolean
  private readonly keepAliveInterval: number
  private readonly destroyed: boolean
  private readonly client: Client
  private readonly updateIntervals: Map<string, any>

  constructor (client: Client, opts: NatAPIOptions = {}) {
    // TTL is 2 hours (min 60 secs, default 2 hours)
    this.ttl = opts.ttl != null ? Math.max(opts.ttl, 60) : 7200
    this.description = opts.description ?? '@achingbrain/nat-port-mapper'
    this.gateway = opts.gateway
    this.keepAlive = opts.keepAlive ?? true
    this.client = client
    this.updateIntervals = new Map()

    // Refresh the mapping 10 minutes before the end of its lifetime
    this.keepAliveInterval = (this.ttl - 600) * 1000
    this.destroyed = false
    this.openPorts = new Map()
  }

  async map (localPort: number, options: MapPortOptions): Promise<number> {
    if (this.destroyed) {
      throw new Error('client is destroyed')
    }

    // Validate input
    const opts = this.validateInput(localPort, options)

    // UDP or TCP
    const mappedPort = await this.client.map(localPort, opts)

    this.openPorts.set(localPort, {
      ...opts,
      signal: undefined
    })

    if (this.keepAlive) {
      this.updateIntervals.set(`${opts.publicPort}:${localPort}-${opts.protocol}`, setInterval(() => {
        void this.client.map(localPort, opts)
          .catch(err => {
            log('error refreshing port mapping %d:%d for protocol %s mapped on router - %e', opts.publicPort, localPort, opts.protocol, err)
          })
      }, this.keepAliveInterval))
    }

    log('port %d:%d for protocol %s mapped on router', opts.publicPort, localPort, opts.protocol)

    return mappedPort
  }

  async unmap (localPort: number, options: AbortOptions): Promise<void> {
    if (this.destroyed) {
      throw new Error('client is destroyed')
    }

    const opts = this.openPorts.get(localPort)

    if (opts == null) {
      log.error('no port mapping found for local port %d', localPort)
      return
    }

    await this.client.unmap(localPort, {
      ...opts,
      signal: options?.signal
    })

    this.openPorts.delete(localPort)

    const key = `${opts.publicPort}:${localPort}-${opts.protocol}`
    clearInterval(this.updateIntervals.get(key))
    this.updateIntervals.delete(key)

    log('port %d:%d for protocol %s unmapped on router', opts.publicPort, localPort, opts.protocol)
  }

  async close (options?: AbortOptions): Promise<void> {
    if (this.destroyed) {
      throw new Error('client already closed')
    }

    // stop all updates
    for (const interval of this.updateIntervals.values()) {
      clearInterval(interval)
    }
    this.updateIntervals.clear()

    // unmap all ports
    await Promise.all(
      [...this.openPorts.entries()].map(async ([port, opts]) => this.unmap(port, {
        ...options,
        ...opts
      }))
    )

    // finally close the client
    if (this.client != null) {
      log('close UPnP client')
      await this.client.close(options)
    }
  }

  private validateInput (localPort: number, options: MapPortOptions = {}): InternalMapOptions {
    const output: InternalMapOptions = {
      localAddress: options.localAddress ?? findLocalAddress(),
      publicPort: options.publicPort ?? localPort,
      publicHost: options.publicHost ?? '',
      protocol: options.protocol ?? 'TCP',
      description: options.description ?? this.description,
      ttl: options.ttl ?? this.ttl,
      gateway: options.gateway ?? this.gateway,
      signal: options.signal
    }

    return output
  }

  async externalIp (options?: AbortOptions): Promise<string> {
    return this.client.externalIp(options)
  }
}

function findLocalAddress (): string {
  const interfaces = os.networkInterfaces()

  for (const infos of Object.values(interfaces)) {
    if (infos == null) {
      continue
    }

    for (const info of infos) {
      if (info.internal) {
        continue
      }

      if (info.family === 'IPv6') {
        continue
      }

      log('found local address', info.address)
      return info.address
    }
  }

  throw new Error('Please pass a `localAddress` to the map function')
}
