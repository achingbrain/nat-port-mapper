import { logger } from '@libp2p/logger'
import { Device } from './device.js'
import type { DiscoverGateway } from '../discovery/index.js'
import type { MapPortOptions, UnmapPortOptions } from '../index.js'
import type { Client } from '../types.js'
import type { AbortOptions } from 'abort-options'

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

  async map (options: MapPortOptions): Promise<void> {
    if (this.closed) {
      throw new Error('client is closed')
    }

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

    log('mapping local port %d to public port %d', options.localPort, options.publicPort)

    await gateway.run('AddPortMapping', [
      ['NewRemoteHost', options.publicHost ?? ''],
      ['NewExternalPort', options.publicPort],
      ['NewProtocol', protocol],
      ['NewInternalPort', options.localPort],
      ['NewInternalClient', options.localAddress],
      ['NewEnabled', 1],
      ['NewPortMappingDescription', description],
      ['NewLeaseDuration', ttl],
      ['NewProtocol', options.protocol]
    ], this.shutdownController.signal)
  }

  async unmap (options: UnmapPortOptions): Promise<void> {
    if (this.closed) {
      throw new Error('client is closed')
    }

    const gateway = await this.findGateway()

    await gateway.run('DeletePortMapping', [
      ['NewRemoteHost', options.publicHost ?? ''],
      ['NewExternalPort', options.publicPort],
      ['NewProtocol', options.protocol]
    ], this.shutdownController.signal)
  }

  async externalIp (options?: AbortOptions): Promise<string> {
    if (this.closed) {
      throw new Error('client is closed')
    }

    log('discover external IP address')

    const gateway = await this.findGateway(options)

    const data = await gateway.run('GetExternalIPAddress', [], this.shutdownController.signal)

    let key = null
    Object.keys(data).some(function (k) {
      if (!/:GetExternalIPAddressResponse$/.test(k)) return false

      key = k
      return true
    })

    if (key == null) {
      throw new Error('Incorrect response')
    }

    log('discovered external IP address %s', data[key].NewExternalIPAddress)
    return data[key].NewExternalIPAddress
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
