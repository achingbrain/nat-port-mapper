import { logger } from '@libp2p/logger'
import { UPNP2_ST, UPNP_ST } from './constants.js'
import { Device } from './device.js'
import { discoverGateways } from './discovery.js'
import { UPnP1Gateway } from './upnp1-gateway.js'
import { UPnP2Gateway } from './upnp2-gateway.js'
import type { Gateway, NatAPIOptions } from '../index.js'
import type { AbortOptions } from 'abort-error'

const log = logger('nat-port-mapper:upnp')

export class UPNPClient {
  static createClient (options?: NatAPIOptions): UPNPClient {
    return new UPNPClient(options)
  }

  private readonly options: NatAPIOptions

  constructor (options: NatAPIOptions = {}) {
    this.options = options
  }

  async * findGateways (options?: AbortOptions): AsyncGenerator<Gateway, void, unknown> {
    log('find uPnP gateways')

    for await (const service of discoverGateways(options)) {
      const device = new Device(service)

      if (service.details.device.deviceType === UPNP_ST) {
        yield new UPnP1Gateway(device, this.options)
      } else if (service.details.device.deviceType === UPNP2_ST) {
        yield new UPnP2Gateway(device, this.options)
      }
    }
  }
}
