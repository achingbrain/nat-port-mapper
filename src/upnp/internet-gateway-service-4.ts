import { DEFAULT_AUTO_REFRESH, DEFAULT_PORT_MAPPING_TTL, DEVICE_WAN_IP_CONNECTION_2 } from './constants.js'
import { InternetGatewayService } from './internet-gateway-service.js'
import { findNamespacedKey } from './utils.js'
import type { MapPortOptions } from '../index.js'
import type { RefreshableMapping } from './internet-gateway-service.js'
import type { AbortOptions } from 'abort-error'

interface IPv4Mapping extends RefreshableMapping {
  remoteHost: string
  externalPort: string
  internalClient: string
  protocol: 'TCP' | 'UDP'
  description: string
}

export class InternetGatewayService4 extends InternetGatewayService<IPv4Mapping> {
  async mapPort (localPort: number, localHost: string, options: MapPortOptions = {}): Promise<number> {
    const mapping: IPv4Mapping = {
      remoteHost: options.remoteHost ?? '',
      externalPort: `${options.externalPort ?? localPort}`,
      internalClient: localHost,
      protocol: options.protocol?.toUpperCase() === 'UDP' ? 'UDP' : 'TCP',
      description: options.description ?? this.options.description ?? '@achingbrain/nat-port-mapper',
      ttl: Math.max(Math.round((options.ttl ?? this.options.ttl ?? DEFAULT_PORT_MAPPING_TTL) / 1000), 3600)
    }

    this.log('creating mapping for local port %d to %j', localPort, mapping)

    const gateway = await this.getGateway(options)
    const response = await gateway.run(DEVICE_WAN_IP_CONNECTION_2, 'AddAnyPortMapping', [
      ['NewRemoteHost', mapping.remoteHost],
      ['NewExternalPort', mapping.externalPort],
      ['NewProtocol', mapping.protocol],
      ['NewInternalPort', localPort],
      ['NewInternalClient', mapping.internalClient],
      ['NewEnabled', 1],
      ['NewPortMappingDescription', mapping.description],
      ['NewLeaseDuration', mapping.ttl]
    ], options)

    // UPnP2 will resolve port mapping conflicts for us so we need to read the
    // mapped port from the response
    const key = findNamespacedKey('AddAnyPortMappingResponse', response)

    if (options.autoRefresh ?? this.options.autoRefresh ?? DEFAULT_AUTO_REFRESH) {
      this.configureRefresh(localPort, mapping, options)
    }

    this.addMapping(localPort, mapping)

    return Number(response[key].NewReservedPort)
  }

  async refreshPort (localPort: number, options?: AbortOptions): Promise<void> {
    const mappings = this.mappings.get(localPort) ?? []

    for (const mapping of mappings) {
      try {
        const gateway = await this.getGateway(options)
        await gateway.run(DEVICE_WAN_IP_CONNECTION_2, 'AddAnyPortMapping', [
          ['NewRemoteHost', mapping.remoteHost],
          ['NewExternalPort', mapping.externalPort],
          ['NewProtocol', mapping.protocol],
          ['NewInternalPort', localPort],
          ['NewInternalClient', mapping.internalClient],
          ['NewEnabled', 1],
          ['NewPortMappingDescription', mapping.description],
          ['NewLeaseDuration', mapping.ttl]
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
        await gateway.run(DEVICE_WAN_IP_CONNECTION_2, 'DeletePortMapping', [
          ['NewRemoteHost', ''],
          ['NewExternalPort', localPort],
          ['NewProtocol', '']
        ], options)
      } catch (err) {
        this.log.error('could not unmap port %d - %e', localPort, err)
      }
    }

    this.mappings.delete(localPort)
  }
}
