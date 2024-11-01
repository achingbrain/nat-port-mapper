/**
 * @packageDocumentation
 *
 * @example
 *
 * ```js
 * import { upnpNat } from '@achingbrain/nat-port-mapper'
 *
 * const client = await upnpNat({
 *   // all fields are optional
 *   ttl: number // how long mappings should live for in seconds - min 20 minutes, default 2 hours
 *   description: string // default description to pass to the router for a mapped port
 *   gateway: string // override the router address, will be auto-detected if not set
 *   keepAlive: boolean // if true, refresh the mapping ten minutes before the ttl is reached, default true
 * })
 *
 * // Map public port 1000 to private port 1000 with TCP
 * await client.map({
 *   localPort: 1000,
 *   protocol: 'TCP'
 * })
 *
 * // Map public port 2000 to private port 3000 with UDP
 * await client.map({
 *   publicPort: 2000,
 *   localPort: 3000,
 *   protocol: 'UDP'
 * })
 *
 * // Unmap port public and private port 1000 with TCP
 * await client.unmap({
 *   localPort: 1000,
 *   protocol: 'TCP'
 * })
 *
 * // Get external IP
 * const externalIp = await client.externalIp()
 *
 * console.log('External IP:', ip)
 *
 * // Unmap all mapped ports
 * client.close()
 * ```
 *
 * ## Credits
 *
 * Based on [alxhotel/nat-api](https://github.com/alxhotel/nat-api)
 *
 * ## Additional Information
 *
 * - <http://miniupnp.free.fr/nat-pmp.html>
 * - <http://wikipedia.org/wiki/NAT_Port_Mapping_Protocol>
 * - <http://tools.ietf.org/html/draft-cheshire-nat-pmp-03>
 */

import os from 'os'
import { logger } from '@libp2p/logger'
import { gateway4sync } from 'default-gateway'
import { discoverGateway } from './discovery/index.js'
import { PMPClient } from './pmp/index.js'
import { UPNPClient } from './upnp/index.js'
import type { Client } from './types.js'
import type { AbortOptions } from 'abort-error'

const log = logger('nat-port-mapper')

export interface NatAPIOptions {
  /**
   * TTL in seconds, minimum one minute
   *
   * @default 7200
   */
  ttl?: number

  /**
   * If passed this will be used as the default description when mapping ports
   *
   * @default '@achingbrain/nat-port-mapper'
   */
  description?: string

  /**
   * If a gateway is known, pass it here, otherwise one will be discovered on
   * the network
   */
  gateway?: string

  /**
   * If true, any mapped ports will be refreshed when their lease expires
   *
   * @default true
   */
  keepAlive?: boolean
}

export interface MapPortOptions extends AbortOptions {
  /**
   * The external port to map
   */
  publicPort: number

  /**
   * The external host to map or '' as a wildcard
   *
   * @default ''
   */
  publicHost?: string

  /**
   * The local port to map
   */
  localPort: number

  /**
   * The local address to map
   */
  localAddress: string

  /**
   * The protocol the port uses
   */
  protocol: 'TCP' | 'UDP'

  /**
   * Some metadata about the mapping
   */
  description: string

  /**
   * How long to map the port for
   */
  ttl: number

  /**
   * A gateway to map the port on, if omitted
   */
  gateway?: string
}

export interface UnmapPortOptions extends AbortOptions {
  /**
   * The external port to unmap
   */
  publicPort: number

  /**
   * The external host to unmap or '' as a wildcard
   *
   * @default ''
   */
  publicHost?: string

  /**
   * The local port to unmap
   */
  localPort: number

  /**
   * The local address to unmap
   */
  localAddress: string

  /**
   * The protocol the port uses
   */
  protocol: 'TCP' | 'UDP'

  /**
   * A gateway to unmap the port on
   */
  gateway?: string
}

export interface NatAPI {
  /**
   * Stop all network transactions and unmap any mapped ports
   */
  close(options?: AbortOptions): Promise<void>

  /**
   * Map a local port to one on the external network interface
   */
  map(options: MapPortOptions): Promise<void>

  /**
   * Unmap a previously mapped port
   */
  unmap(options: UnmapPortOptions): Promise<void>

  /**
   * Find the external network IP address
   */
  externalIp(options?: AbortOptions): Promise<string>
}

export class NatAPI {
  public openPorts: MapPortOptions[]
  private readonly ttl: number
  private readonly description: string
  private readonly gateway?: string
  private readonly keepAlive: boolean
  private readonly keepAliveInterval: number
  private readonly destroyed: boolean
  private readonly client: Client
  private readonly updateIntervals: Map<string, any>

  constructor (opts: NatAPIOptions = {}, client: Client) {
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
    this.openPorts = []
  }

  async map (options?: Partial<MapPortOptions>): Promise<void> {
    if (this.destroyed) {
      throw new Error('client is destroyed')
    }

    // Validate input
    const opts = this.validateInput(options)

    // UDP or TCP
    await this.client.map(opts)

    this.openPorts.push(opts)

    if (this.keepAlive) {
      this.updateIntervals.set(`${opts.publicPort}:${opts.localPort}-${opts.protocol}`, setInterval(() => {
        void this.client.map(opts)
          .catch(err => {
            log('error refreshing port mapping %d:%d for protocol %s mapped on router - %e', opts.publicPort, opts.localPort, opts.protocol, err)
          })
      }, this.keepAliveInterval))
    }

    log('port %d:%d for protocol %s mapped on router', opts.publicPort, opts.localPort, opts.protocol)
  }

  async unmap (options: Partial<UnmapPortOptions>): Promise<void> {
    if (this.destroyed) {
      throw new Error('client is destroyed')
    }

    // Validate input
    const opts = this.validateInput(options)

    // UDP or TCP
    await this.client.unmap(opts)

    this.openPorts = this.openPorts.filter((openPort) => {
      return openPort.publicPort !== opts.publicPort && openPort.protocol !== opts.protocol
    })

    const key = `${opts.publicPort}:${opts.localPort}-${opts.protocol}`
    clearInterval(this.updateIntervals.get(key))
    this.updateIntervals.delete(key)

    log('port %d:%d for protocol %s unmapped on router', opts.publicPort, opts.localPort, opts.protocol)
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
      this.openPorts.map(async opts => this.unmap({
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

  private validateInput (options: Partial<MapPortOptions> = {}): MapPortOptions {
    if (options.localPort == null) {
      throw new Error('invalid parameters')
    }

    const output: MapPortOptions = {
      localPort: options.localPort,
      localAddress: options.localAddress ?? findLocalAddress(),
      publicPort: options.publicPort ?? options.localPort,
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

export function upnpNat (options: Partial<NatAPIOptions> = {}): NatAPI {
  const client = UPNPClient.createClient(discoverGateway(options))

  return new NatAPI(options, client)
}

export function pmpNat (options: Partial<NatAPIOptions> = {}): NatAPI {
  const client = PMPClient.createClient(discoverGateway({
    ...options,
    gateway: gateway4sync().gateway
  }))

  return new NatAPI(options, client)
}
