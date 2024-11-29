import { isIPv4, isIPv6 } from '@chainsafe/is-ip'
import { logger } from '@libp2p/logger'
import { DEVICE_INTERNET_GATEWAY_SERVICE_2, ONE_HOUR } from './constants.js'
import { Device } from './device.js'
import { discoverGateways } from './discovery.js'
import { fetchXML } from './fetch.js'
import { InternetGatewayService4 } from './internet-gateway-service-4.js'
import { InternetGatewayService6 } from './internet-gateway-service-6.js'
import { stripHostBrackets } from './utils.js'
import type { FindGatewaysOptions, Gateway, UPnPNATOptions } from '../index.js'
import type { AbortOptions } from 'abort-error'

const log = logger('nat-port-mapper:upnp')

export class UPnPClient {
  private readonly options: UPnPNATOptions

  constructor (options: UPnPNATOptions = {}) {
    this.options = options
  }

  async * findGateways (options?: FindGatewaysOptions): AsyncGenerator<Gateway, void, unknown> {
    log('find uPnP gateways')

    for await (const service of discoverGateways(options)) {
      const device = new Device(service)
      const host = stripHostBrackets(device.service.location.hostname)

      if (isIPv4(host)) {
        yield new InternetGatewayService4(device, this.options)
      }

      if (isIPv6(host)) {
        yield new InternetGatewayService6(device, this.options)
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

    if (service.details.device.deviceType === DEVICE_INTERNET_GATEWAY_SERVICE_2) {
      if (isIPv4(location.hostname)) {
        return new InternetGatewayService4(device, this.options)
      }

      return new InternetGatewayService6(device, this.options)
    }

    throw new Error(`Device type was not "${DEVICE_INTERNET_GATEWAY_SERVICE_2}", it was "${service.details.device.deviceType}"`)
  }
}
