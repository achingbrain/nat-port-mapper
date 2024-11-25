import ssdp from '@achingbrain/ssdp'
import { logger } from '@libp2p/logger'
import first from 'it-first'
import type { InternetGatewayDevice } from '../upnp/device'
import type { Service, SSDP } from '@achingbrain/ssdp'
import type { AbortOptions } from 'abort-error'

const log = logger('nat-port-mapper:discovery')

export interface DiscoverGateway {
  (options?: AbortOptions): Promise<Service<InternetGatewayDevice>>
}

export interface DiscoveryOptions extends AbortOptions {
  /**
   * Do not search the network for a gateway, use this instead
   */
  gateway?: string

  /**
   * Rediscover gateway after this number of ms
   */
  timeout?: number
}

const ST = 'urn:schemas-upnp-org:device:InternetGatewayDevice:2'
const ONE_MINUTE = 60000
const ONE_HOUR = ONE_MINUTE * 60

export function discoverGateway (): () => DiscoverGateway {
  let service: Service<InternetGatewayDevice>
  let expires: number

  return (): DiscoverGateway => {
    return async (options?: DiscoveryOptions) => {
      const timeout = options?.timeout ?? ONE_HOUR

      if (service != null && !(expires < Date.now())) {
        return service
      }

      if (options?.gateway != null) {
        log('using overridden gateway address %s', options.gateway)

        if (!options.gateway.startsWith('http')) {
          options.gateway = `http://${options.gateway}`
        }

        expires = Date.now() + timeout

        service = {
          location: new URL(options.gateway),
          details: {
            device: {
              serviceList: {
                service: []
              },
              deviceList: {
                device: []
              }
            }
          },
          expires,
          serviceType: ST,
          uniqueServiceName: 'unknown'
        }
      } else {
        log('create discovery')
        let discovery: SSDP | undefined

        try {
          discovery = await ssdp()
          discovery.on('transport:outgoing-message', (socket, message, remote) => {
            log.trace('-> Outgoing to %s:%s via %s - %s', remote.address, remote.port, socket.type, message)
          })
          discovery.on('transport:incoming-message', (message, remote) => {
            log.trace('<- Incoming from %s:%s - %s', remote.address, remote.port, message)
          })

          const result = await first(discovery.discover<InternetGatewayDevice>({
            ...options,
            serviceType: ST
          }))

          if (result == null) {
            throw new Error('Could not discover gateway')
          }

          log('discovered gateway %s', result.location)

          expires = Date.now() + timeout
          service = result
        } finally {
          await discovery?.stop()
        }
      }

      return service
    }
  }
}
