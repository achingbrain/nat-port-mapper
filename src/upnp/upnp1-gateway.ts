import { logger } from '@libp2p/logger'
import { UPnPGateway } from './upnp-gateway.js'
import type { Device } from './device.js'
import type { GlobalMapPortOptions, Protocol } from '../index.js'
import type { AbortOptions } from 'abort-error'

export class UPnP1Gateway extends UPnPGateway {
  constructor (gateway: Device, options: GlobalMapPortOptions = {}) {
    super(gateway, logger('nat-port-mapper:upnp:upnp1gateway'), options)
  }

  async mapPort (localHost: string, localPort: number, publicHost: string, publicPort: number, protocol: Protocol, ttl: number, description: string, options?: AbortOptions): Promise<number> {
    await this.gateway.run('AddPortMapping', [
      ['NewRemoteHost', publicHost],
      ['NewExternalPort', publicPort],
      ['NewProtocol', protocol.toUpperCase()],
      ['NewInternalPort', localPort],
      ['NewInternalClient', localHost],
      ['NewEnabled', 1],
      ['NewPortMappingDescription', description],
      ['NewLeaseDuration', Math.round(ttl / 1000)]
    ], options)

    return publicPort
  }
}
