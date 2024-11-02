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

import { gateway4sync } from 'default-gateway'
import { discoverGateway } from './discovery/index.js'
import { NatAPI as NatAPIClass } from './nat-api.js'
import { PMPClient } from './pmp/index.js'
import { UPNPClient } from './upnp/index.js'
import type { AbortOptions } from 'abort-error'

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
   * The external port to map. If omitted the `localPort` value will be used.
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
  protocol?: 'TCP' | 'UDP'

  /**
   * Some metadata about the mapping
   *
   * @default '@achingbrain/nat-port-mapper'
   */
  description?: string

  /**
   * How long to map the port for in seconds
   *
   * @default 7200
   */
  ttl?: number

  /**
   * A gateway to map the port on, if omitted the preconfigured value will be
   * used, otherwise it will be auto-detected
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
  map(localPort: number, options?: MapPortOptions): Promise<void>

  /**
   * Unmap a previously mapped port
   */
  unmap(localPort: number, options?: AbortOptions): Promise<void>

  /**
   * Find the external network IP address
   */
  externalIp(options?: AbortOptions): Promise<string>
}

export function upnpNat (options: Partial<NatAPIOptions> = {}): NatAPI {
  const client = UPNPClient.createClient(discoverGateway())

  return new NatAPIClass(client, options)
}

export function pmpNat (options: Partial<NatAPIOptions> = {}): NatAPI {
  const client = PMPClient.createClient(discoverGateway())

  return new NatAPIClass(client, {
    ...options,
    gateway: gateway4sync().gateway
  })
}
