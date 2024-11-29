import { DEFAULT_AUTO_REFRESH, DEFAULT_PORT_MAPPING_TTL, DEVICE_WAN_IP_CONNECTION_2 } from './constants.js'
import { InternetGatewayService } from './internet-gateway-service.js'
import { findNamespacedKey } from './utils.js'
import type { MapPortOptions } from '../index.js'
import type { RefreshableMapping } from './internet-gateway-service.js'
import type { AbortOptions } from 'abort-error'

interface IPv6Mapping extends RefreshableMapping {
  remoteHost: string
  externalPort: string
  internalClient: string
  protocol: '6' | '17'
  description: string
  uniqueId: number
}

const AddPinholeProtocols: Record<string, '6' | '17'> = {
  TCP: '6',
  UDP: '17'
}

export class InternetGatewayService6 extends InternetGatewayService<IPv6Mapping> {
  async mapPort (localPort: number, localHost: string, options: MapPortOptions = {}): Promise<number> {
    const mapping: IPv6Mapping = {
      remoteHost: options.remoteHost ?? '',
      internalClient: localHost,
      externalPort: `${options.externalPort ?? ''}`,
      protocol: AddPinholeProtocols[options.protocol?.toUpperCase() === 'UDP' ? 'UDP' : 'TCP'] ?? '6',
      description: options.description ?? this.options.description ?? '@achingbrain/nat-port-mapper',
      ttl: Math.max(Math.round((options.ttl ?? this.options.ttl ?? DEFAULT_PORT_MAPPING_TTL) / 1000), 3600),
      uniqueId: 0
    }

    this.log('creating mapping for local port %d to %j', localPort, mapping)

    const gateway = await this.getGateway(options)
    const response = await gateway.run(DEVICE_WAN_IP_CONNECTION_2, 'AddPinhole', [
      ['RemoteHost', mapping.remoteHost],
      ['RemotePort', mapping.externalPort],
      ['InternalClient', localHost],
      ['InternalPort', localPort],
      ['Protocol', mapping.protocol],
      ['LeaseTime', mapping.ttl]
    ], options)

    const key = findNamespacedKey('AddPinholeResponse', response)

    if (options.autoRefresh ?? this.options.autoRefresh ?? DEFAULT_AUTO_REFRESH) {
      this.configureRefresh(localPort, mapping, options)
    }

    this.addMapping(localPort, {
      ...mapping,
      uniqueId: Number(response[key].UniqueID)
    })

    return localPort
  }

  async refreshPort (localPort: number, options?: AbortOptions): Promise<void> {
    const mappings = this.mappings.get(localPort) ?? []

    for (const mapping of mappings) {
      try {
        const gateway = await this.getGateway(options)
        await gateway.run(DEVICE_WAN_IP_CONNECTION_2, 'UpdatePinhole', [
          ['UniqueID', mapping.uniqueId],
          ['NewLeaseTime', mapping.ttl]
        ], options)
      } catch (err) {
        this.log.error('could not refresh port %d mapping - %e', localPort, err)
      }

      this.configureRefresh(localPort, mapping, options)
    }
  }

  async unmap (localPort: number, options?: AbortOptions): Promise<void> {
    const mappings = this.mappings.get(localPort) ?? []

    for (const mapping of mappings) {
      try {
        clearTimeout(mapping.refreshTimeout)

        const gateway = await this.getGateway(options)
        await gateway.run(DEVICE_WAN_IP_CONNECTION_2, 'DeletePinhole', [
          ['UniqueID', mapping.uniqueId]
        ], options)
      } catch (err) {
        this.log.error('could not unmap port %d - %e', localPort, err)
      }
    }

    this.mappings.delete(localPort)
  }
}
