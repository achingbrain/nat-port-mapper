/* eslint-disable no-console */
import { upnpNat } from '../dist/src/index.js'

const port = Number(process.argv[2] ?? 3000)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Usage: npm run example:map-port -- <port>')
  process.exitCode = 1
} else {
  const client = upnpNat()
  let mapped = false

  for await (const gateway of client.findGateways({ signal: AbortSignal.timeout(10000) })) {
    try {
      for await (const mapping of gateway.mapAll(port, { protocol: 'tcp' })) {
        console.log(`mapped ${mapping.internalHost}:${mapping.internalPort} to ${mapping.externalHost}:${mapping.externalPort}`)
        mapped = true
      }
    } finally {
      await gateway.stop()
    }
  }

  if (!mapped) {
    console.error('No UPnP gateway found or no mapping was created')
    process.exitCode = 1
  }
}
