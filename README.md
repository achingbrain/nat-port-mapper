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

## Example

```js
import { upnpNat } from '@achingbrain/nat-port-mapper'

const client = await upnpNat({
  // all fields are optional
  ttl: number // how long mappings should live for in seconds - min 20 minutes, default 2 hours
  description: string // default description to pass to the router for a mapped port
  gateway: string // override the router address, will be auto-detected if not set
  keepAlive: boolean // if true, refresh the mapping ten minutes before the ttl is reached, default true
})

// Map public port 1000 to private port 1000 with TCP
await client.map({
  localPort: 1000,
  protocol: 'TCP'
})

// Map public port 2000 to private port 3000 with UDP
await client.map({
  publicPort: 2000,
  localPort: 3000,
  protocol: 'UDP'
})

// Unmap port public and private port 1000 with TCP
await client.unmap({
  localPort: 1000,
  protocol: 'TCP'
})

// Get external IP
const externalIp = await client.externalIp()

console.log('External IP:', ip)

// Unmap all mapped ports
client.close()
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

# License

Licensed under either of

- Apache 2.0, ([LICENSE-APACHE](https://github.com/achingbrain/nat-port-mapper/LICENSE-APACHE) / <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT ([LICENSE-MIT](https://github.com/achingbrain/nat-port-mapper/LICENSE-MIT) / <http://opensource.org/licenses/MIT>)

# Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
