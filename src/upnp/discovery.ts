import ssdp from '@achingbrain/ssdp'
import { logger } from '@libp2p/logger'
import merge from 'it-merge'
import { UPNP2_ST, UPNP_ST } from './constants.js'
import { fetchXML } from './fetch.js'
import type { InternetGatewayDevice } from './device.js'
import type { DiscoveryOptions } from '../index.js'
import type { Service, SSDP } from '@achingbrain/ssdp'

const log = logger('nat-port-mapper:discovery')

const ONE_MINUTE = 60000
const ONE_HOUR = ONE_MINUTE * 60

export async function * discoverGateways (options?: DiscoveryOptions): AsyncGenerator<Service<InternetGatewayDevice>, void, unknown> {
  if (options?.gateway != null) {
    log('using overridden gateway address %s', options.gateway)
    const descriptor = await fetchXML(new URL(options.gateway), options)

    yield {
      location: new URL(options.gateway),
      details: descriptor,
      expires: Date.now() + ONE_HOUR,
      serviceType: descriptor.device.deviceType,
      uniqueServiceName: descriptor.device.UDN
    }

    return
  }

  let discovery: SSDP | undefined

  try {
    discovery = await ssdp()
    discovery.on('transport:outgoing-message', (socket, message, remote) => {
      log.trace('-> Outgoing to %s:%s via %s', remote.address, remote.port, socket.type)
      log.trace('%s', message)
    })
    discovery.on('transport:incoming-message', (message, remote) => {
      log.trace('<- Incoming from %s:%s', remote.address, remote.port)
      log.trace('%s', message)
    })

    log('searching for gateways')

    const discovered = new Set<string>()

    for await (const service of merge(
      discovery.discover<InternetGatewayDevice>({
        ...options,
        serviceType: UPNP_ST
      }),
      discovery.discover<InternetGatewayDevice>({
        ...options,
        serviceType: UPNP2_ST
      })
    )) {
      if (discovered.has(service.location.toString())) {
        continue
      }

      discovered.add(service.location.toString())

      if (service.details.device.deviceType === UPNP_ST) {
        log('discovered UPnP gateway %s %s', service.location, service.uniqueServiceName)
        yield service
      } else if (service.details.device.deviceType === UPNP2_ST) {
        log('discovered UPnP2 gateway %s %s', service.location, service.uniqueServiceName)
        yield service
      }
    }
  } catch (err) {
    log.error('error during service discovery - %e', err)
  } finally {
    await discovery?.stop()
  }
}
