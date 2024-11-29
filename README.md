# @achingbrain/nat-port-mapper

[![codecov](https://img.shields.io/codecov/c/github/achingbrain/nat-port-mapper.svg?style=flat-square)](https://codecov.io/gh/achingbrain/nat-port-mapper)
[![CI](https://img.shields.io/github/actions/workflow/status/achingbrain/nat-port-mapper/js-test-and-release.yml?branch=main\&style=flat-square)](https://github.com/achingbrain/nat-port-mapper/actions/workflows/js-test-and-release.yml?query=branch%3Amain)

> Port mapping with UPnP and NAT-PMP

# About

<!--

!IMPORTANT!

Everything in this README between "# About" and "# Install" is automatically
generated and will be overwritten the next time the doc generator is run.

To make changes to this section, please update the @packageDocumentation section
of src/index.js or src/index.ts

To experiment with formatting, please run "npm run docs" from the root of this
repo and examine the changes made.

-->

Enable NAT traversal by mapping public ports to ports on your computer using
either [UPnP](https://en.wikipedia.org/wiki/Universal_Plug_and_Play) or
[NAT-PMP](https://en.wikipedia.org/wiki/NAT_Port_Mapping_Protocol).

## Example - UPnP NAT

```TypeScript
import { upnpNat } from '@achingbrain/nat-port-mapper'

const client = upnpNat()

for await (const gateway of client.findGateways({ signal: AbortSignal.timeout(10000) })) {
  // Map public port 1000 to private port 1000 with TCP
  await gateway.map(1000, '192.168.1.123', {
    protocol: 'tcp'
  })

  // Map port 3000 to any available host name
  for await (const mapping of gateway.mapAll(3000, {
    protocol: 'udp'
  })) {
    console.info(`mapped ${mapping.internalHost}:${mapping.internalPort} to ${mapping.externalHost}:${mapping.externalPort}`)
  }

  // Unmap previously mapped private port 1000
  await gateway.unmap(1000)

  // Get external IP
  const externalIp = await gateway.externalIp()

  console.log('External IP:', externalIp)

  // Unmap all mapped ports and cancel any in-flight network operations
  await gateway.stop()
}
```

## Example - NAT-PMP

```TypeScript
import { pmpNat } from '@achingbrain/nat-port-mapper'
import { gateway4sync } from 'default-gateway'

const gateway = pmpNat(gateway4sync().gateway)

// Map public port 1000 to private port 1000 with TCP
await gateway.map(1000, '192.168.1.123', {
  protocol: 'tcp'
})

// Map public port 2000 to private port 3000 with UDP
await gateway.map(3000, '192.168.1.123', {
  externalPort: 2000,
  protocol: 'udp'
})

// Unmap previously mapped private port 1000
await gateway.unmap(1000)

// Get external IP
const externalIp = await gateway.externalIp()

console.log('External IP:', externalIp)

// Unmap all mapped ports and cancel any in-flight network operations
await gateway.stop()
```

## Credits

Based on [alxhotel/nat-api](https://github.com/alxhotel/nat-api)

## Additional Information

- <http://miniupnp.free.fr/nat-pmp.html>
- <http://wikipedia.org/wiki/NAT_Port_Mapping_Protocol>
- <http://tools.ietf.org/html/draft-cheshire-nat-pmp-03>

# Install

```console
$ npm i @achingbrain/nat-port-mapper
```

# API Docs

- <https://achingbrain.github.io/nat-port-mapper>

# License

Licensed under either of

- Apache 2.0, ([LICENSE-APACHE](https://github.com/achingbrain/nat-port-mapper/LICENSE-APACHE) / <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT ([LICENSE-MIT](https://github.com/achingbrain/nat-port-mapper/LICENSE-MIT) / <http://opensource.org/licenses/MIT>)

# Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
