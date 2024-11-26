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
 * for await (const gateway of client.findGateways({ signal: AbortSignal.timeout(10000) })) {
 *   // Map public port 1000 to private port 1000 with TCP
 *   await gateway.map(1000, {
 *     protocol: 'TCP'
 *   })
 *
 *   // Map public port 2000 to private port 3000 with UDP
 *   await gateway.map(3000, {
 *     publicPort: 2000,
 *     protocol: 'UDP'
 *   })
 *
 *   // Unmap previously mapped private port 1000
 *   await gateway.unmap(1000)
 *
 *   // Get external IP
 *   const externalIp = await gateway.externalIp()
 *
 *   console.log('External IP:', ip)
 *
 *   // Unmap all mapped ports and cancel any in-flight network operations
 *   await client.stop()
 * }
 *
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

import { gateway4sync } from 'default-gateway'
import { PMPClient } from './pmp/index.js'
import { UPNPClient } from './upnp/index.js'
import type { AbortOptions } from 'abort-error'

export type Protocol = 'tcp' | 'udp'

export interface NatAPIOptions {
  /**
   * TTL for port mappings in ms
   *
   * @default 720_000
   */
  ttl?: number

  /**
   * If passed this will be used as the default description when mapping ports
   *
   * @default '@achingbrain/nat-port-mapper'
   */
  description?: string

  /**
   * If true, any mapped ports will be refreshed when their lease expires
   *
   * @default true
   */
  autoRefresh?: boolean
}

export interface MapPortOptions extends AbortOptions {
  /**
   * The external port to map. If omitted a free port will be chosen.
   *
   * @default localPort
   */
  publicPort?: number

  /**
   * The external host to map or '' as a wildcard
   *
   * @default ''
   */
  publicHost?: string

  /**
   * The local address to map. If omitted the first non-loopback local address
   * will be used.
   */
  localAddress?: string

  /**
   * The protocol the port uses
   *
   * @default 'TCP'
   */
  protocol?: Protocol

  /**
   * Some metadata about the mapping
   *
   * @default '@achingbrain/nat-port-mapper'
   */
  description?: string

  /**
   * How long to map the port for in ms
   *
   * @default 720_000
   */
  ttl?: number

  /**
   * A gateway to map the port on, if omitted the preconfigured value will be
   * used, otherwise it will be auto-detected
   */
  gateway?: string

  /**
   * Whether to automatically renew the port mapping after it expires
   *
   * @default true
   */
  autoRefresh?: boolean

  /**
   * How long to wait while trying to refresh a port mapping in ms
   *
   * @default 10_000
   */
  refreshTimeout?: number

  /**
   * How long before expiry to remap the port mapping in ms
   *
   * @default 60_000
   */
  refreshOffset?: number
}

export interface Gateway {
  id: string

  /**
   * Stop all network transactions and unmap any mapped ports
   */
  stop(options?: AbortOptions): Promise<void>

  /**
   * Map a local port to one on the external network interface
   *
   * Returns the external port number that was mapped - this may be different
   * from the requested port number if that port was not free.
   */
  map(localPort: number, options?: MapPortOptions): Promise<number>

  /**
   * Unmap a previously mapped port
   */
  unmap(localPort: number, options?: AbortOptions): Promise<void>

  /**
   * Find the external network IP address
   */
  externalIp(options?: AbortOptions): Promise<string>
}

export interface DiscoveryOptions extends AbortOptions {
  /**
   * Do not search the network for a gateway, use this instead. The value should
   * be a fully qualified URL to a device descriptor XML file, e.g.
   * `http://192.168.1.1:4558/rootDesc.xml`
   */
  gateway?: string
}

export interface NatAPI {
  /**
   * Search the local network for gateways - when enough gateways have been
   * found, either break out of the `for await..of` loop or abort a passed
   * `AbortSignal`.
   */
  findGateways (options?: DiscoveryOptions): AsyncGenerator<Gateway, void, unknown>
}

export function upnpNat (options: NatAPIOptions = {}): NatAPI {
  return UPNPClient.createClient(options)
}

export function pmpNat (gateway: string = gateway4sync().gateway, options: NatAPIOptions = {}): NatAPI {
  return PMPClient.createClient(gateway, options)
}
