import { expect } from 'aegir/chai'
import { gateway4sync } from 'default-gateway'
import { pmpNat } from '../src/index.js'
import { randomPort } from './fixtures/random-port.js'
import type { Gateway } from '../src/index.js'

describe('pmp-nat-port-mapper', () => {
  let gateway: Gateway

  afterEach(async () => {
    await gateway?.stop()
  })

  it('should map a port', async () => {
    if (process.env.CI != null) {
      return // CI environments don't have NAT-PMP routers!
    }

    const port = randomPort()

    gateway = pmpNat(gateway4sync().gateway)
    const mapped = await gateway.map(port)

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
      return // CI environments don't have NAT-PMP routers!
    }

    gateway = pmpNat(gateway4sync().gateway)
    const ip = await gateway.externalIp({
      signal: AbortSignal.timeout(5000)
    })

    expect(ip).to.be.ok()
  })
})
