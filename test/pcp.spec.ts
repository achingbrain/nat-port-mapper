import { expect } from 'aegir/chai'
import { gateway6sync } from 'default-gateway'
import { pcp } from '../src/index.js'
import { randomPort } from './fixtures/random-port.js'
import type { Gateway } from '../src/index.js'

describe('pcp-nat-port-mapper', () => {
  let gateway: Gateway

  afterEach(async () => {
    await gateway?.stop()
  })

  it('should map a port', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have PCP routers!
    }

    if (!process.env.GATEWAY) {
      throw new Error('GATEWAY env not set')
    }

    const port = randomPort()
    const mapped = []

    gateway = pcp(process.env.GATEWAY)
    console.log('gateway', gateway)

    for await (const mapping of gateway.mapAll(port, {})) {
      console.log('mapping', mapping)
      expect(mapping.externalHost).to.be.a('string')
      expect(mapping.externalPort).to.be.a('number')

      expect(mapping.internalHost).to.be.a('string')
      expect(mapping.internalPort).to.be.a('number')

      mapped.push(mapping)
    }


    // Ensure that we got at least one successful mapping
    expect(mapped).to.have.lengthOf.at.least(1)

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve()
      }, 10000)
    })

    // await gateway.unmap(port) // TODO
  })

  it.skip('should discover an external ip address', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have NAT-PMP routers!
    }

    gateway = pcp(gateway6sync().gateway)
    console.log({ gateway })
    const ip = await gateway.externalIp({
      signal: AbortSignal.timeout(5000)
    })

    expect(ip).to.be.ok()
  })
})
