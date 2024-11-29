import { isIPv6, isIPv4 } from '@chainsafe/is-ip'
import { logger } from '@libp2p/logger'
import { isPrivateIp } from '../utils.js'
import { DEFAULT_REFRESH_THRESHOLD, DEFAULT_REFRESH_TIMEOUT, DEVICE_WAN_IP_CONNECTION_2 } from './constants.js'
import { Device } from './device.js'
import { discoverGateways } from './discovery.js'
import { findLocalAddresses, findNamespacedKey, stripHostBrackets } from './utils.js'
import type { Gateway, MapPortOptions, PortMapping, UPnPNATOptions } from '../index.js'
import type { Logger } from '@libp2p/logger'
import type { AbortOptions } from 'abort-error'

export interface RefreshableMapping {
  refreshTimeout?: ReturnType<typeof setTimeout>
  ttl: number
}

export abstract class InternetGatewayService<Mapping extends RefreshableMapping> implements Gateway {
  public id: string
  public host: string
  public port: number
  public readonly family: 'IPv4' | 'IPv6'

  private gateway: Device
  protected readonly log: Logger
  protected readonly mappings: Map<number, Mapping[]>
  protected readonly options: UPnPNATOptions

  constructor (gateway: Device, options: UPnPNATOptions = {}) {
    this.gateway = gateway
    this.mappings = new Map()
    this.id = gateway.service.uniqueServiceName
    this.options = options
    this.host = ''
    this.port = 0
    this.setGateway(gateway)
    this.family = isIPv6(this.host) ? 'IPv6' : 'IPv4'
    this.log = logger(`nat-port-mapper:upnp:internetgatewaydevice2:${this.family.toLowerCase()}`)
  }

  protected async getGateway (options?: AbortOptions): Promise<Device> {
    if (this.gateway.service.expires > Date.now()) {
      return this.gateway
    }

    for await (const service of discoverGateways({
      ...this.options,
      ...options
    })) {
      if (service.uniqueServiceName !== this.id) {
        continue
      }

      const host = stripHostBrackets(service.location.hostname)

      if (isIPv4(host) && this.family === 'IPv6') {
        continue
      }

      if (isIPv6(host) && this.family === 'IPv4') {
        continue
      }

      this.setGateway(new Device(service))

      return this.gateway
    }

    throw new Error(`Could not resolve gateway with USN ${this.id}`)
  }

  private setGateway (gateway: Device): void {
    this.gateway = gateway
    this.host = stripHostBrackets(this.gateway.service.location.hostname)
    this.port = Number(this.gateway.service.location.port ?? (this.gateway.service.location.protocol === 'http:' ? 80 : 443))
  }

  async externalIp (options?: AbortOptions): Promise<string> {
    this.log.trace('discover external IP address')

    const gateway = await this.getGateway(options)
    const response = await gateway.run(DEVICE_WAN_IP_CONNECTION_2, 'GetExternalIPAddress', [], options)
    const key = findNamespacedKey('GetExternalIPAddressResponse', response)

    this.log.trace('discovered external IP address %s', response[key].NewExternalIPAddress)
    return response[key].NewExternalIPAddress
  }

  async * mapAll (localPort: number, options: MapPortOptions = {}): AsyncGenerator<PortMapping, void, unknown> {
    let mapped = false

    for (const host of findLocalAddresses(this.family)) {
      try {
        const mapping = await this.map(localPort, host, options)
        mapped = true

        yield mapping
      } catch (err) {
        this.log.error('error mapping %s:%d - %e', host, localPort, err)
      }
    }

    if (!mapped) {
      throw new Error(`All attempts to map port ${localPort} failed`)
    }
  }

  async map (localPort: number, localHost: string, options?: MapPortOptions): Promise<PortMapping> {
    const port = await this.mapPort(localPort, localHost, options)

    return {
      externalHost: isPrivateIp(localHost) === true ? await this.externalIp(options) : localHost,
      externalPort: port,
      internalHost: localHost,
      internalPort: localPort,
      protocol: options?.protocol?.toUpperCase() === 'UDP' ? 'UDP' : 'TCP'
    }
  }

  protected abstract mapPort (localPort: number, localHost: string, options?: MapPortOptions): Promise<number>
  abstract unmap (localPort: number, options?: AbortOptions): Promise<void>

  protected addMapping (localPort: number, mapping: Mapping): void {
    const mappings = this.mappings.get(localPort) ?? []
    mappings.push(mapping)
    this.mappings.set(localPort, mappings)
  }

  protected configureRefresh (localPort: number, mapping: Mapping, options: MapPortOptions = {}): void {
    if (options.autoRefresh === false || this.options.autoRefresh === false) {
      return
    }

    const refresh = ((localPort: number, options: MapPortOptions = {}): void => {
      this.refreshPort(localPort, {
        ...options,
        signal: AbortSignal.timeout(options.refreshTimeout ?? this.options.refreshTimeout ?? DEFAULT_REFRESH_TIMEOUT)
      })
        .catch(err => {
          this.log.error('could not refresh port mapping - %e', err)
        })
    }).bind(this, localPort, {
      ...options,
      signal: undefined
    })

    const ms = (mapping.ttl * 1000) - (options.refreshThreshold ?? this.options.refreshThreshold ?? DEFAULT_REFRESH_THRESHOLD)
    mapping.refreshTimeout = setTimeout(refresh, ms)
  }

  protected abstract refreshPort (localPort: number, options?: AbortOptions): Promise<void>

  async stop (options?: AbortOptions): Promise<void> {
    for (const port of this.mappings.keys()) {
      await this.unmap(port, options)
    }

    this.mappings.clear()
    this.gateway.close()
  }
}
