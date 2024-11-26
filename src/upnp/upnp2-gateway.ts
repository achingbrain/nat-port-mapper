import { logger } from '@libp2p/logger'
import { UPnPGateway } from './upnp-gateway.js'
import { findNamespacedKey } from './utils.js'
import type { Device } from './device.js'
import type { GlobalMapPortOptions, Protocol } from '../index.js'
import type { AbortOptions } from 'abort-error'

export class UPnP2Gateway extends UPnPGateway {
  constructor (gateway: Device, options: GlobalMapPortOptions = {}) {
    super(gateway, logger('nat-port-mapper:upnp:upnp2gateway'), options)
  }

  async mapPort (localHost: string, localPort: number, publicHost: string, publicPort: number, protocol: Protocol, ttl: number, description: string, options?: AbortOptions): Promise<number> {
    const response = await this.gateway.run('AddAnyPortMapping', [
      ['NewRemoteHost', publicHost],
      ['NewExternalPort', publicPort],
      ['NewProtocol', protocol.toUpperCase()],
      ['NewInternalPort', localPort],
      ['NewInternalClient', localHost ?? ''],
      ['NewEnabled', 1],
      ['NewPortMappingDescription', description],
      ['NewLeaseDuration', Math.round(ttl / 1000)]
    ], options)

    // UPnP2 will resolve port mapping conflicts for us so we need to read the
    // mapped port from the response
    const key = findNamespacedKey('AddAnyPortMappingResponse', response)

    return Number(response[key].NewReservedPort)
  }
}
