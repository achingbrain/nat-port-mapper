/**
 * @packageDocumentation
 *
 * Enable NAT traversal by mapping public ports to ports on your computer using
 * either [UPnP](https://en.wikipedia.org/wiki/Universal_Plug_and_Play) or
 * [NAT-PMP](https://en.wikipedia.org/wiki/NAT_Port_Mapping_Protocol).
 *
 * @example UPnP NAT
 *
 * ```TypeScript
 * import { upnpNat } from '@achingbrain/nat-port-mapper'
 *
 * const client = upnpNat()
 *
 * for await (const gateway of client.findGateways({ signal: AbortSignal.timeout(10000) })) {
 *   // Map public port 1000 to private port 1000 with TCP
 *   await gateway.map(1000, {
 *     protocol: 'tcp'
 *   })
 *
 *   // Map public port 2000 to private port 3000 with UDP
 *   await gateway.map(3000, {
 *     publicPort: 2000,
 *     protocol: 'udp'
 *   })
 *
 *   // Unmap previously mapped private port 1000
 *   await gateway.unmap(1000)
 *
 *   // Get external IP
 *   const externalIp = await gateway.externalIp()
 *
 *   console.log('External IP:', externalIp)
 *
 *   // Unmap all mapped ports and cancel any in-flight network operations
 *   await gateway.stop()
 * }
 * ```
 *
 * @example NAT-PMP
 *
 * ```TypeScript
 * import { pmpNat } from '@achingbrain/nat-port-mapper'
 * import { gateway4sync } from 'default-gateway'
 *
 * const client = pmpNat()
 *
 * const gateway = await client.getGateway(gateway4sync().gateway)
 *
 * // Map public port 1000 to private port 1000 with TCP
 * await gateway.map(1000, {
 *   protocol: 'tcp'
 * })
 *
 * // Map public port 2000 to private port 3000 with UDP
 * await gateway.map(3000, {
 *   publicPort: 2000,
 *   protocol: 'udp'
 * })
 *
 * // Unmap previously mapped private port 1000
 * await gateway.unmap(1000)
 *
 * // Get external IP
 * const externalIp = await gateway.externalIp()
 *
 * console.log('External IP:', externalIp)
 *
 * // Unmap all mapped ports and cancel any in-flight network operations
 * await gateway.stop()
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

import { PMPClient } from './pmp/index.js'
import { UPnPClient } from './upnp/index.js'
import type { AbortOptions } from 'abort-error'

export type Protocol = 'tcp' | 'udp'

export interface GlobalMapPortOptions {
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
  refreshBeforeExpiry?: number
}

export interface MapPortOptions extends GlobalMapPortOptions, AbortOptions {
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

export interface UPnPNAT {
  /**
   * Search the local network for gateways - when enough gateways have been
   * found, either break out of the `for await..of` loop or abort a passed
   * `AbortSignal`.
   */
  findGateways (options?: AbortOptions): AsyncGenerator<Gateway, void, unknown>

  /**
   * Use a specific network gateway for port mapping.
   *
   * For UPnP this should be a fully qualified URL to a device descriptor XML
   * document, e.g. `http://192.168.1.1:4558/rootDesc.xml`
   */
  getGateway (descriptor: URL, options?: AbortOptions): Promise<Gateway>
}

/**
 * Create a UPnP port mapper
 */
export function upnpNat (options: GlobalMapPortOptions = {}): UPnPNAT {
  return new UPnPClient(options)
}

export interface PMPNAT {
  /**
   * Use a specific network gateway for port mapping
   */
  getGateway (ipAddress: string, options?: AbortOptions): Promise<Gateway>
}

/**
 * Create a NAT-PMP port mapper
 */
export function pmpNat (options: GlobalMapPortOptions = {}): PMPNAT {
  return new PMPClient(options)
}
