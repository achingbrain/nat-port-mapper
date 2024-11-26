import { DEFAULT_PORT_MAPPING_TTL, DEFAULT_REFRESH_OFFSET, DEFAULT_REFRESH_TIMEOUT } from './constants.js'
import { findLocalAddress, findNamespacedKey } from './utils.js'
import type { Device } from './device.js'
import type { Gateway, MapPortOptions, NatAPIOptions, Protocol } from '../index.js'
import type { Logger } from '@libp2p/logger'
import type { AbortOptions } from 'abort-error'

export abstract class UPnPGateway implements Gateway {
  public id: string
  protected readonly gateway: Device
  protected readonly log: Logger
  private readonly refreshIntervals: Map<number, ReturnType<typeof setTimeout>>
  private readonly options: NatAPIOptions

  constructor (gateway: Device, log: Logger, options: NatAPIOptions = {}) {
    this.gateway = gateway
    this.log = log
    this.refreshIntervals = new Map()
    this.id = gateway.service.uniqueServiceName
    this.options = options
  }

  async map (localPort: number, options: MapPortOptions = {}): Promise<number> {
    const description = options.description ?? this.options.description ?? '@achingbrain/nat-port-mapper'
    const ttl = options.ttl ?? this.options.ttl ?? DEFAULT_PORT_MAPPING_TTL
    const localAddress = options.localAddress ?? findLocalAddress()
    const publicPort = options.publicPort ?? localPort

    this.log('mapping local port %s:%d to public port %d', localAddress, localPort, publicPort)

    const mappedPort = this.mapPort(
      options.localAddress ?? findLocalAddress(),
      localPort,
      options.publicHost ?? '',
      publicPort,
      options.protocol ?? 'tcp',
      ttl,
      description,
      options
    )

    if (options.autoRefresh !== false && this.options.autoRefresh !== false) {
      const refresh = ((localPort: number, options: MapPortOptions = {}): void => {
        this.map(localPort, {
          ...options,
          signal: AbortSignal.timeout(options.refreshTimeout ?? DEFAULT_REFRESH_TIMEOUT)
        })
          .catch(err => {
            this.log.error('could not refresh port mapping - %e', err)
          })
      }).bind(this, localPort, {
        ...options,
        signal: undefined
      })

      this.refreshIntervals.set(localPort, setTimeout(refresh, ttl - (options.refreshOffset ?? DEFAULT_REFRESH_OFFSET)))
    }

    return mappedPort
  }

  abstract mapPort (localHost: string, localPort: number, publicHost: string, publicPort: number, protocol: Protocol, ttl: number, description: string, options?: AbortOptions): Promise<number>

  async unmap (localPort: number, options?: AbortOptions): Promise<void> {
    await this.gateway.run('DeletePortMapping', [
      ['NewRemoteHost', ''],
      ['NewExternalPort', localPort],
      ['NewProtocol', '']
    ], options)

    this.refreshIntervals.delete(localPort)
  }

  async externalIp (options?: AbortOptions): Promise<string> {
    this.log.trace('discover external IP address')

    const response = await this.gateway.run('GetExternalIPAddress', [], options)
    const key = findNamespacedKey('GetExternalIPAddressResponse', response)

    this.log.trace('discovered external IP address %s', response[key].NewExternalIPAddress)
    return response[key].NewExternalIPAddress
  }

  async stop (options?: AbortOptions): Promise<void> {
    await Promise.all([...this.refreshIntervals.entries()].map(async ([port, timeout]) => {
      clearTimeout(timeout)
      await this.unmap(port, options)
    }))

    this.refreshIntervals.clear()
    this.gateway.close()
  }
}
