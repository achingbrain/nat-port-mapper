import { networkInterfaces } from 'node:os'
import ssdp from '@achingbrain/ssdp'
import { isIPv6 } from '@chainsafe/is-ip'
import { logger, enabled } from '@libp2p/logger'
import { DEVICE_INTERNET_GATEWAY_SERVICE_2 } from './constants.js'
import type { InternetGatewayDevice } from './device.js'
import type { DiscoverOptions, Service, SSDP, SSDPSocketOptions } from '@achingbrain/ssdp'

const log = logger('nat-port-mapper:discovery')

function weAreSender (sender: string): boolean {
  const addresses: string[] = []

  // only calculate if trace logging is enabled
  if (enabled('nat-port-mapper:discovery:trace')) {
    const interfaces = networkInterfaces()

    Object.entries(interfaces).forEach(([name, addrs]) => {
      addrs?.forEach(addr => {
        addresses.push(addr.address)
      })
    })
  }

  return addresses.includes(sender)
}

function getSockets (): SSDPSocketOptions[] {
  const sockets: SSDPSocketOptions[] = []

  for (const interfaces of Object.values(networkInterfaces())) {
    if (interfaces == null) {
      continue
    }

    interfaces.forEach(iface => {
      if (iface.internal) {
        // skip loopback addresses
        return
      }

      if (iface.address.startsWith('169.254.') || iface.address.startsWith('fe80')) {
        // skip link local-local addresses
        // https://en.wikipedia.org/wiki/Link-local_address
        return
      }

      sockets.push({
        type: iface.family === 'IPv4' ? 'udp4' : 'udp6',
        bind: {
          address: iface.address,
          port: 1900
        }
      })
    })
  }

  return sockets
}

export async function * discoverGateways (options?: DiscoverOptions): AsyncGenerator<Service<InternetGatewayDevice>, void, unknown> {
  let discovery: SSDP | undefined

  try {
    discovery = await ssdp({
      cache: false,
      sockets: getSockets()
    })
    discovery.on('transport:outgoing-message', (socket, message, remote) => {
      log.trace('-> Outgoing to %s:%s via %s', isIPv6(remote.address) ? `[${remote.address}]` : remote.address, remote.port, socket.type)
      log.trace('%s', message)
    })
    discovery.on('transport:incoming-message', (message, remote) => {
      if (weAreSender(remote.address)) {
        return
      }

      log.trace('<- Incoming from %s:%s', isIPv6(remote.address) ? `[${remote.address}]` : remote.address, remote.port)
      log.trace('%s', message)
    })
    discovery.on('error', (err) => {
      log.error('SSDP error - %e', err)
    })

    log('searching for gateways')

    const services = new Set<string>()

    for await (const service of discovery.discover<InternetGatewayDevice>({
      ...options,
      serviceType: DEVICE_INTERNET_GATEWAY_SERVICE_2
    })) {
      if (service.serviceType !== DEVICE_INTERNET_GATEWAY_SERVICE_2) {
        continue
      }

      const location = service.location.toString()

      if (services.has(location)) {
        continue
      }

      services.add(location)

      log('discovered UPnP2 gateway %s %s', service.location, service.uniqueServiceName)
      yield service
    }
  } catch (err) {
    if (options?.signal?.aborted !== true) {
      log.error('error during service discovery - %e', err)
    }
  } finally {
    await discovery?.stop()
  }
}
