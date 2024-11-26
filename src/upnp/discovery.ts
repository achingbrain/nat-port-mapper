import ssdp from '@achingbrain/ssdp'
import { logger } from '@libp2p/logger'
import merge from 'it-merge'
import { UPNP2_ST, UPNP_ST } from './constants.js'
import type { InternetGatewayDevice } from './device.js'
import type { Service, SSDP } from '@achingbrain/ssdp'
import type { AbortOptions } from 'abort-error'

const log = logger('nat-port-mapper:discovery')

export async function * discoverGateways (options?: AbortOptions): AsyncGenerator<Service<InternetGatewayDevice>, void, unknown> {
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

      const deviceType = service.details.device?.deviceType ?? service.serviceType

      if (deviceType === UPNP2_ST) {
        log('discovered UPnP2 gateway %s %s', service.location, service.uniqueServiceName)
        yield service
      } else if (deviceType === UPNP_ST) {
        log('discovered UPnP gateway %s %s', service.location, service.uniqueServiceName)
        yield service
      }
    }
  } catch (err) {
    if (options?.signal?.aborted !== true) {
      log.error('error during service discovery - %e', err)
    }
  } finally {
    await discovery?.stop()
  }
}
