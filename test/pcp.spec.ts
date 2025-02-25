import { assert, expect } from 'aegir/chai'
import { pcpNat } from '../src/index.js'
import { randomPort } from './fixtures/random-port.js'
import type { Gateway } from '../src/index.js'
import type { PCPGateway } from '../src/pcp/gateway.js'
// import type { PCPNATClient } from '../src/pcp/index.js'
// import type { PCPNATClient } from '../src/pcp/index.js'

// Helper to wait until at least one mapping has expiresAt > 2 minutes from now
async function waitForRefreshedMapping (
  gateway: PCPGateway,
  maxWaitMs: number // total time to poll before giving up
): Promise<boolean> {
  const start = Date.now()

  const initialMappings = JSON.parse(JSON.stringify(gateway.getMappings()))

  while ((Date.now() - start) < maxWaitMs) {
    const mappings = gateway.getMappings()

    // Look for any mapping with expiresAt > 2 minutes from now
    for (const initial of initialMappings) {
      for (const current of mappings) {
        const initialExpiresAt = initial.expiresAt
        const currentExpiresAt = current.expiresAt

        if (initialExpiresAt !== undefined && currentExpiresAt !== undefined) {
          // Check if mapping matches and has been refreshed
          // eslint-disable-next-line max-depth
          if (initial.internalHost === current.internalHost &&
            initial.internalPort === current.internalPort &&
            initial.protocol === current.protocol &&
            initialExpiresAt < currentExpiresAt) {
            return true // Found a refreshed mapping
          }
        }
      }
    }

    // Wait for 5 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  // Timeout exceeded, no refreshed mapping found
  return false
}

describe('pcp-nat-port-mapper', () => {
  let gateway: Gateway

  afterEach(async () => {
    try {
      await gateway?.stop()
    } catch {
    }
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

    try {
      gateway = await pcpNat(process.env.GATEWAY).getGateway()
    } catch (err: any) {
      assert.fail(`Gateway initialization failed: ${err.message}`)
    }

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
  })

  it('should discover an external ip address', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have PCP routers!
    }

    if (process.env.GATEWAY === undefined) {
      throw new Error('GATEWAY env not set')
    }

    gateway = await pcpNat(process.env.GATEWAY).getGateway()

    const ip = await gateway.externalIp({
      signal: AbortSignal.timeout(5000)
    })

    expect(ip).to.be.ok()
  })

  it('should detect if the gateway supports PCP', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have PCP routers!
    }

    if (process.env.GATEWAY === undefined) {
      throw new Error('GATEWAY env not set')
    }

    try {
      gateway = await pcpNat(process.env.GATEWAY).getGateway()
    } catch (err: any) {
      assert.fail(`Gateway initialization failed: ${err.message}`)
    }

    expect(gateway).to.be.ok()
  })

  it('should fail if the gateway is not found', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have PCP routers!
    }

    try {
      gateway = await pcpNat('127.0.0.2').getGateway()
    } catch (err: any) {
      expect(err.message).to.contain('No PCP server found')
      return
    }

    assert.fail('Should have thrown')
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

    gateway = await pcpNat(process.env.GATEWAY).getGateway()

    const ttl = 120 // minimum TTL as per PCP spec
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

    const maxWaitMs = 2.5 * 60 * 1000
    expect(await waitForRefreshedMapping(gateway as PCPGateway, maxWaitMs)).to.eq(true)
  }).timeout(3 * 60 * 1000)

  it('should remap a port', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have PCP routers!
    }

    if (process.env.GATEWAY === undefined) {
      throw new Error('GATEWAY env not set')
    }

    const port = randomPort()
    const mapped = []

    try {
      gateway = await pcpNat(process.env.GATEWAY).getGateway()
    } catch (err: any) {
      assert.fail(`Gateway initialization failed: ${err.message}`)
    }

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

    await (gateway as PCPGateway).remap()
  })
})
