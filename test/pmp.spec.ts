import { expect } from 'aegir/chai'
import { pmpNat } from '../src/index.js'
import type { MapPortOptions, NatAPI } from '../src/index.js'

describe('pmp-nat-port-mapper', () => {
  let client: NatAPI

  before(() => {
    if (process.env.CI != null) {
      return // CI environments don't have uPNP routers!
    }

    client = pmpNat()
  })

  after(async () => {
    await client?.close()
  })

  it('should map a port', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have uPNP routers!
    }

    const details: Partial<MapPortOptions> = {
      localPort: 48932,
      protocol: 'TCP'
    }

    await client.map(details)

    process.on('SIGINT', () => {
      void client.unmap(details)
        .finally(() => {
          process.exit(0)
        })
    })
  })

  it('should discover an external ip address', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have uPNP routers!
    }

    const ip = await client.externalIp({
      signal: AbortSignal.timeout(5000)
    })

    expect(ip).to.be.ok()
  })
})
