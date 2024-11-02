import { setMaxListeners } from 'node:events'
import { logger } from '@libp2p/logger'
import { anySignal } from 'any-signal'
import { Device } from './device.js'
import type { DiscoverGateway } from '../discovery/index.js'
import type { Client, InternalMapOptions } from '../types.js'
import type { AbortOptions } from 'abort-error'

const log = logger('nat-port-mapper:upnp')

export class UPNPClient implements Client {
  private closed: boolean
  private readonly discoverGateway: () => DiscoverGateway
  private cancelGatewayDiscovery?: (options?: AbortOptions) => Promise<void>
  private readonly shutdownController: AbortController

  static createClient (discoverGateway: () => DiscoverGateway): UPNPClient {
    return new UPNPClient(discoverGateway)
  }

  constructor (discoverGateway: () => DiscoverGateway) {
    this.discoverGateway = discoverGateway
    this.closed = false

    // used to terminate network operations on shutdown
    this.shutdownController = new AbortController()
  }

  async map (localPort: number, options: InternalMapOptions): Promise<number> {
    if (this.closed) {
      throw new Error('client is closed')
    }

    const signal = anySignal([this.shutdownController.signal, options.signal])
    setMaxListeners(Infinity, signal)

    const gateway = await this.findGateway()
    const description = options.description ?? 'node:nat:upnp'
    const protocol = options.protocol === 'TCP' ? options.protocol : 'UDP'
    let ttl = 60 * 30

    if (typeof options.ttl === 'number') {
      ttl = options.ttl
    }

    if (typeof options.ttl === 'string' && !isNaN(options.ttl)) {
      ttl = Number(options.ttl)
    }

    log('mapping local port %d to public port %d', localPort, options.publicPort)

    const response = await gateway.run('AddAnyPortMapping', [
      ['NewRemoteHost', options.publicHost ?? ''],
      ['NewExternalPort', options.publicPort],
      ['NewProtocol', protocol],
      ['NewInternalPort', localPort],
      ['NewInternalClient', options.localAddress],
      ['NewEnabled', 1],
      ['NewPortMappingDescription', description],
      ['NewLeaseDuration', ttl]
    ], signal)
    const key = this.findNamespacedKey('AddAnyPortMappingResponse', response)

    return Number(response[key].NewReservedPort)
  }

  async unmap (localPort: number, options: InternalMapOptions): Promise<void> {
    if (this.closed) {
      throw new Error('client is closed')
    }

    const signal = anySignal([this.shutdownController.signal, options.signal])
    setMaxListeners(Infinity, signal)

    const gateway = await this.findGateway({
      ...options,
      signal
    })

    await gateway.run('DeletePortMapping', [
      ['NewRemoteHost', options.publicHost],
      ['NewExternalPort', options.publicPort],
      ['NewProtocol', options.protocol]
    ], signal)
  }

  async externalIp (options?: AbortOptions): Promise<string> {
    if (this.closed) {
      throw new Error('client is closed')
    }

    log('discover external IP address')

    const gateway = await this.findGateway(options)

    const response = await gateway.run('GetExternalIPAddress', [], this.shutdownController.signal)
    const key = this.findNamespacedKey('GetExternalIPAddressResponse', response)

    log('discovered external IP address %s', response[key].NewExternalIPAddress)
    return response[key].NewExternalIPAddress
  }

  private findNamespacedKey (key: string, data: any): string {
    let ns = null
    Object.keys(data).some((k) => {
      if (new RegExp(`!/:${key}$/`).test(k)) {
        return false
      }

      ns = k
      return true
    })

    if (ns == null) {
      throw new Error('Incorrect response')
    }

    return ns
  }

  async findGateway (options?: AbortOptions): Promise<Device> {
    if (this.closed) {
      throw new Error('client is closed')
    }

    const discovery = this.discoverGateway()
    this.cancelGatewayDiscovery = discovery.cancel

    const service = await discovery.gateway(options)

    this.cancelGatewayDiscovery = undefined

    return new Device(service)
  }

  async close (options?: AbortOptions): Promise<void> {
    this.closed = true

    this.shutdownController.abort()

    if (this.cancelGatewayDiscovery != null) {
      await this.cancelGatewayDiscovery(options)
    }
  }
}
