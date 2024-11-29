import { expect } from 'aegir/chai'
import { upnpNat } from '../src/index.js'
import { randomPort } from './fixtures/random-port.js'
import type { Gateway, UPnPNAT } from '../src/index.js'

describe('upnp-nat-port-mapper', () => {
  let client: UPnPNAT
  let gateways: Gateway[]

  beforeEach(() => {
    if (process.env.CI != null) {
      return // CI environments don't have uPNP routers!
    }

    gateways = []
    client = upnpNat()
  })

  afterEach(async () => {
    if (process.env.CI != null) {
      return // CI environments don't have uPNP routers!
    }

    await Promise.all(
      gateways.map(async gateway => gateway.stop())
    )
  })

  it('should map a port on all available addresses', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have uPNP routers!
    }

    const port = randomPort()
    const mapped = []

    for await (const gateway of client.findGateways({
      signal: AbortSignal.timeout(5000)
    })) {
      for await (const mapping of gateway.mapAll(port)) {
        expect(mapping.externalHost).to.be.a('string')
        expect(mapping.externalPort).to.be.a('number')

        expect(mapping.internalHost).to.be.a('string')
        expect(mapping.internalPort).to.be.a('number')

        mapped.push(mapping)
      }
    }

    expect(mapped).to.not.be.empty()

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve()
      }, 30000)
    })
  })

  // this doesn't work, at least with my router - you have to request a port
  // mapping from the same interface as the requested local address
  it.skip('should map an IPv6 port via a IPv4 gateway', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have uPNP routers!
    }

    const port = randomPort()

    const v4Descriptor = new URL('http://192.168.1.1:44496/rootDesc.xml')
    const v6Descriptor = new URL('http://[2a00:23c6:14b1:7e00::1]:44496/rootDesc.xml')

    const gateway = await client.getGateway(new URL(v6Descriptor))
    // @ts-expect-error not a public field
    gateway.gateway.service.location.host = v4Descriptor.host

    const mapped = await gateway.map(port, '2a00:23c6:14b1:7e00:c880:61c8:d229:c26c')

    expect(mapped).to.be.a('number')

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve()
      }, 30000)
    })

    await gateway.unmap(port)
  })

  it('should discover an external ip address', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have uPNP routers!
    }

    for await (const gateway of client.findGateways()) {
      const ip = await gateway.externalIp({
        signal: AbortSignal.timeout(5000)
      })

      expect(ip).to.be.ok()
    }
  })
})
