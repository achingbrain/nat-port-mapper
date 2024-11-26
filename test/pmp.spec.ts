import { expect } from 'aegir/chai'
import { pmpNat } from '../src/index.js'
import { randomPort } from './fixtures/random-port.js'
import type { Gateway, NatAPI } from '../src/index.js'

describe('pmp-nat-port-mapper', () => {
  let client: NatAPI
  let gateways: Gateway[]

  beforeEach(() => {
    if (process.env.CI != null) {
      return // CI environments don't have NAT-PMP routers!
    }

    gateways = []
    client = pmpNat()
  })

  afterEach(async () => {
    if (process.env.CI != null) {
      return // CI environments don't have NAT-PMP routers!
    }

    await Promise.all(
      gateways.map(async gateway => gateway.stop())
    )
  })

  it('should map a port', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have NAT-PMP routers!
    }

    const port = randomPort()

    for await (const gateway of client.findGateways()) {
      const mapped = await gateway.map(port)

      expect(mapped).to.be.a('number')

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve()
        }, 30000)
      })

      await gateway.unmap(port)
    }
  })

  it('should discover an external ip address', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have NAT-PMP routers!
    }

    for await (const gateway of client.findGateways()) {
      const ip = await gateway.externalIp({
        signal: AbortSignal.timeout(5000)
      })

      expect(ip).to.be.ok()
    }
  })
})
