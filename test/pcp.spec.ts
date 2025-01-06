import { expect } from 'aegir/chai'
import { gateway6sync } from 'default-gateway'
import { pcp } from '../src/index.js'
import { randomPort } from './fixtures/random-port.js'
import type { Gateway } from '../src/index.js'
import type { PCPGateway } from '../src/pcp/gateway.js'

// Helper to wait until at least one mapping has expiresAt > 2 minutes from now
async function waitForRefreshedMapping (
  gateway: PCPGateway,
  minExtraMs: number, // e.g. 2 minutes in ms
  maxWaitMs: number // total time to poll before giving up
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const start = Date.now()

    const check = () => {
      const now = Date.now()
      const mappings = gateway.getMappings()
      console.log({ mappings })

      // Look for any mapping with expiresAt (in seconds) beyond "now + minExtraMs"
      const found = mappings.some(m => {
        // If expiresAt is in seconds, multiply by 1000
        if (m.expiresAt != null) {
          return (m.expiresAt * 1000) > (now + minExtraMs)
        }
        return false
      })

      if (found) {
        resolve(true); return
      }

      if ((now - start) >= maxWaitMs) {
        reject(new Error('Timed out waiting for mapping to refresh.')); return
      }

      setTimeout(check, 5000) // poll every 5 seconds
    }

    // Kick off the polling
    check()
  })
}

describe('pcp-nat-port-mapper', () => {
  let gateway: Gateway

  afterEach(async () => {
    // await gateway?.stop()
  })

  it('should map a port', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have PCP routers!
    }

    if (process.env.GATEWAY === undefined) {
      throw new Error('GATEWAY env not set')
    }

    const port = randomPort()
    const mapped = []

    gateway = pcp(process.env.GATEWAY)

    for await (const mapping of gateway.mapAll(port, {})) {
      // console.log('mapping', mapping)
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
      }, 5000)
    })
    await gateway?.stop()

    // await gateway.unmap(port) // TODO
  })

  it('should refresh a mapping', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have PCP routers!
    }

    if (process.env.GATEWAY === undefined) {
      throw new Error('GATEWAY env not set')
    }

    const port = randomPort()
    const mapped = []

    gateway = pcp(process.env.GATEWAY)

    const ttl = 120
    for await (const mapping of gateway.mapAll(port, { ttl })) {
      // console.log('mapping', mapping)
      expect(mapping.externalHost).to.be.a('string')
      expect(mapping.externalPort).to.be.a('number')

      expect(mapping.internalHost).to.be.a('string')
      expect(mapping.internalPort).to.be.a('number')

      mapped.push(mapping)
    }

    // Ensure that we got at least one successful mapping
    expect(mapped).to.have.lengthOf.at.least(1)

    const twoMinutesMs = 2 * 60 * 1000
    const maxWaitMs = 2.5 * 60 * 1000
    await expect(waitForRefreshedMapping(gateway as PCPGateway, twoMinutesMs, maxWaitMs)).to.eventually.be.true

    // await gateway.unmap(port) // TODO
  }).timeout(3 * 60 * 1000)

  it.skip('should discover an external ip address', async () => {
    // TODO
    if (process.env.CI != null) {
      return // CI environments don't have NAT-PMP routers!
    }

    gateway = pcp(gateway6sync().gateway)
    const ip = await gateway.externalIp({
      signal: AbortSignal.timeout(5000)
    })

    expect(ip).to.be.ok()
  })
})
