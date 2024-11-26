import { logger } from '@libp2p/logger'
import { ONE_HOUR, UPNP2_ST, UPNP_ST } from './constants.js'
import { Device } from './device.js'
import { discoverGateways } from './discovery.js'
import { fetchXML } from './fetch.js'
import { UPnP1Gateway } from './upnp1-gateway.js'
import { UPnP2Gateway } from './upnp2-gateway.js'
import type { Gateway, GlobalMapPortOptions } from '../index.js'
import type { AbortOptions } from 'abort-error'

const log = logger('nat-port-mapper:upnp')

export class UPnPClient {
  private readonly options: GlobalMapPortOptions

  constructor (options: GlobalMapPortOptions = {}) {
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

  async getGateway (location: URL, options: AbortOptions = {}): Promise<Gateway> {
    const descriptor = await fetchXML(location, options)

    const service = {
      location,
      details: descriptor,
      expires: Date.now() + ONE_HOUR,
      serviceType: descriptor.device.deviceType,
      uniqueServiceName: descriptor.device.UDN
    }

    const device = new Device(service)

    if (service.details.device.deviceType === UPNP_ST) {
      return new UPnP1Gateway(device, this.options)
    } else if (service.details.device.deviceType === UPNP2_ST) {
      return new UPnP2Gateway(device, this.options)
    }

    throw new Error(`Device type was not UPnP1 or UPnP2, it was "${service.details.device.deviceType}"`)
  }
}
