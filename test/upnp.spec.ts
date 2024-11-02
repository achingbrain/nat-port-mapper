import { expect } from 'aegir/chai'
import { upnpNat } from '../src/index.js'
import type { NatAPI } from '../src/index.js'

describe('upnp-nat-port-mapper', () => {
  let client: NatAPI

  before(() => {
    if (process.env.CI != null) {
      return // CI environments don't have uPNP routers!
    }

    client = upnpNat()
  })

  after(async () => {
    await client?.close()
  })

  it('should map a port', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have uPNP routers!
    }

    const port = 48932

    await client.map(port)

    process.on('SIGINT', () => {
      void client.unmap(port)
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
