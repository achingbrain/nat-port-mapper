import ssdp from '@achingbrain/ssdp'
import { setMaxListeners } from '@libp2p/interface'
import { logger } from '@libp2p/logger'
import { anySignal } from 'any-signal'
import first from 'it-first'
import type { InternetGatewayDevice } from '../upnp/device'
import type { Service, SSDP } from '@achingbrain/ssdp'
import type { AbortOptions } from 'abort-options'

const log = logger('nat-port-mapper:discovery')

export interface DiscoverGateway {
  gateway(options?: AbortOptions): Promise<Service<InternetGatewayDevice>>
  cancel(options?: AbortOptions): Promise<void>
}

export interface DiscoveryOptions {
  /**
   * Do not search the network for a gateway, use this instead
   */
  gateway?: string

  /**
   * Rediscover gateway after this number of ms
   */
  timeout?: number
}

const ST = 'urn:schemas-upnp-org:device:InternetGatewayDevice:1'
const ONE_MINUTE = 60000
const ONE_HOUR = ONE_MINUTE * 60

export function discoverGateway (options: DiscoveryOptions = {}): () => DiscoverGateway {
  const timeout = options.timeout ?? ONE_HOUR
  let service: Service<InternetGatewayDevice>
  let expires: number
  const shutdownController = new AbortController()
  setMaxListeners(Infinity, shutdownController.signal)

  return () => {
    const discover: DiscoverGateway = {
      gateway: async (opts?: AbortOptions) => {
        opts?.signal?.throwIfAborted()

        if (service != null && !(expires < Date.now())) {
          return service
        }

        if (options.gateway != null) {
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

            const signal = anySignal([shutdownController.signal, opts?.signal])
            setMaxListeners(Infinity, signal)

            const result = await first(discovery.discover<InternetGatewayDevice>({
              serviceType: ST,
              signal
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
      },
      cancel: async () => {
        shutdownController.abort()
      }
    }

    return discover
  }
}
