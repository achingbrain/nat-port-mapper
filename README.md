# @achingbrain/nat-port-mapper

[![Build Status](https://github.com/achingbrain/nat-port-mapper/actions/workflows/js-test-and-release.yml/badge.svg?branch=master)](https://github.com/achingbrain/nat-port-mapper/actions/workflows/js-test-and-release.yml)
[![Coverage Status](https://coveralls.io/repos/achingbrain/nat-port-mapper/badge.svg?branch=master&service=github)](https://coveralls.io/github/achingbrain/ssdp?branch=master)

> Fast port mapping with **UPnP** and **NAT-PMP** in NodeJS

## Install

```sh
npm install nat-api
```

## Usage

```js
import { upnpNat } from '@achingbrain/nat-port-mapper'

const client = await upnpNat()

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
await client.un({
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

- http://miniupnp.free.fr/nat-pmp.html
- http://wikipedia.org/wiki/NAT_Port_Mapping_Protocol
- http://tools.ietf.org/html/draft-cheshire-nat-pmp-03

## License

[Apache-2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT) © Protocol Labs
