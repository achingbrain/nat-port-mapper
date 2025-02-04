## [4.0.2](https://github.com/achingbrain/nat-port-mapper/compare/v4.0.1...v4.0.2) (2025-02-04)

### Bug Fixes

* only log SSDP search response from other peers ([#87](https://github.com/achingbrain/nat-port-mapper/issues/87)) ([4ed5d12](https://github.com/achingbrain/nat-port-mapper/commit/4ed5d12d884c2b270480fd89a135f566bccb1cac))

## [4.0.1](https://github.com/achingbrain/nat-port-mapper/compare/v4.0.0...v4.0.1) (2024-12-17)

### Bug Fixes

* log SSDP errors ([#85](https://github.com/achingbrain/nat-port-mapper/issues/85)) ([37bb8ca](https://github.com/achingbrain/nat-port-mapper/commit/37bb8cabff591d6d8f82f3acb37e5291c254392c))

## [4.0.0](https://github.com/achingbrain/nat-port-mapper/compare/v3.0.2...v4.0.0) (2024-11-29)

### ⚠ BREAKING CHANGES

* map now requires the internal host to map ports for

### Features

* specify external hosts for mapping ([#84](https://github.com/achingbrain/nat-port-mapper/issues/84)) ([579ac48](https://github.com/achingbrain/nat-port-mapper/commit/579ac483aa4f31fe5c6ed37ce03ba68f6acf3e6d))

## [3.0.2](https://github.com/achingbrain/nat-port-mapper/compare/v3.0.1...v3.0.2) (2024-11-26)

### Bug Fixes

* detect internet gateway device from service type ([#83](https://github.com/achingbrain/nat-port-mapper/issues/83)) ([11cddc6](https://github.com/achingbrain/nat-port-mapper/commit/11cddc6c34e9ce1beeaf95184c7511b710e2fa64))

## [3.0.1](https://github.com/achingbrain/nat-port-mapper/compare/v3.0.0...v3.0.1) (2024-11-26)

### Bug Fixes

* close socket after pmp unmap ([#82](https://github.com/achingbrain/nat-port-mapper/issues/82)) ([52f87ad](https://github.com/achingbrain/nat-port-mapper/commit/52f87ad66470ffbb2cbae3cac072439b0c279e46)), closes [#65](https://github.com/achingbrain/nat-port-mapper/issues/65)

## [3.0.0](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.10...v3.0.0) (2024-11-26)

### ⚠ BREAKING CHANGES

* use `findGateways` to find a gateway before mapping ports

### Features

* support multiple gateways ([#81](https://github.com/achingbrain/nat-port-mapper/issues/81)) ([8b46979](https://github.com/achingbrain/nat-port-mapper/commit/8b469794a4809a37ccbd43f274606e7de0d94710)), closes [#74](https://github.com/achingbrain/nat-port-mapper/issues/74)

## [2.0.10](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.9...v2.0.10) (2024-11-25)

### Bug Fixes

* handle missing gateway ([6549f7d](https://github.com/achingbrain/nat-port-mapper/commit/6549f7db09051821f3ff8d5d5ac8b9e5802815cf))

## [2.0.9](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.8...v2.0.9) (2024-11-25)

### Bug Fixes

* log errors during service discovery ([05b621b](https://github.com/achingbrain/nat-port-mapper/commit/05b621b96ca587fb4500fa4b43393b0626c466a8))

## [2.0.8](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.7...v2.0.8) (2024-11-25)

### Bug Fixes

* use signals for aborting gateway search ([#80](https://github.com/achingbrain/nat-port-mapper/issues/80)) ([1d571d8](https://github.com/achingbrain/nat-port-mapper/commit/1d571d8e4ab6614300f2fdadb5ce46845618bb21))

## [2.0.7](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.6...v2.0.7) (2024-11-24)

### Bug Fixes

* increase max listeners on shutdown controller signal ([#79](https://github.com/achingbrain/nat-port-mapper/issues/79)) ([6e1b344](https://github.com/achingbrain/nat-port-mapper/commit/6e1b344cf00fdb14b0c962fd5a098f8d4ba38698))

## [2.0.6](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.5...v2.0.6) (2024-11-22)

### Bug Fixes

* reject when mapping a port fails ([#78](https://github.com/achingbrain/nat-port-mapper/issues/78)) ([4b87305](https://github.com/achingbrain/nat-port-mapper/commit/4b873057e114f3388a5caa00cfb1689bd09ca9e9))

## [2.0.5](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.4...v2.0.5) (2024-11-02)

### Bug Fixes

* support upnp 2 any port mapping ([75142be](https://github.com/achingbrain/nat-port-mapper/commit/75142be22f94f304c462e4d8af5eb84192022504))

## [2.0.4](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.3...v2.0.4) (2024-11-02)

### Documentation

* update readme example ([4ebacbb](https://github.com/achingbrain/nat-port-mapper/commit/4ebacbb8e68ca8f9ce9d90fe909c9e5278013a9b))

## [2.0.3](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.2...v2.0.3) (2024-11-02)

### Bug Fixes

* make ports required ([eaae326](https://github.com/achingbrain/nat-port-mapper/commit/eaae32632a38e20108bfe413671dd978b2e14b15))

## [2.0.2](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.1...v2.0.2) (2024-11-01)

### Bug Fixes

* make fields optional ([c5cf08f](https://github.com/achingbrain/nat-port-mapper/commit/c5cf08fa35ef10dcc7b10d124b69a448a2e9fea5))

## [2.0.1](https://github.com/achingbrain/nat-port-mapper/compare/v2.0.0...v2.0.1) (2024-11-01)

### Bug Fixes

* update pmp function ([528b966](https://github.com/achingbrain/nat-port-mapper/commit/528b9668b34d4624005fcc75ec50f86de8f0ef8f))

## [2.0.0](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.18...v2.0.0) (2024-11-01)

### ⚠ BREAKING CHANGES

* accept abort signals during operations (#77)

### Features

* accept abort signals during operations ([#77](https://github.com/achingbrain/nat-port-mapper/issues/77)) ([c6197ac](https://github.com/achingbrain/nat-port-mapper/commit/c6197ac09857a9e1f84ab6667b86d745c823753e))

## [1.0.18](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.17...v1.0.18) (2024-11-01)

### Bug Fixes

* add required NewRemoteHost field ([#71](https://github.com/achingbrain/nat-port-mapper/issues/71)) ([9fbc684](https://github.com/achingbrain/nat-port-mapper/commit/9fbc684ef3ab938a31603234a01f05ff4af4ae99))

## [1.0.17](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.16...v1.0.17) (2024-11-01)

### Bug Fixes

* update project ([e499506](https://github.com/achingbrain/nat-port-mapper/commit/e499506f6fa75f1d67699d6d4a4e07f468d7de9f))

## [1.0.16](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.15...v1.0.16) (2024-11-01)

### Dependencies

* **dev:** bump aegir from 44.1.4 to 45.0.1 ([#76](https://github.com/achingbrain/nat-port-mapper/issues/76)) ([1a0425f](https://github.com/achingbrain/nat-port-mapper/commit/1a0425fe56ab1ad4b34c93349f2bba8ead03075d))

## [1.0.15](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.14...v1.0.15) (2024-09-12)

### Bug Fixes

* accept ports as numbers ([#68](https://github.com/achingbrain/nat-port-mapper/issues/68)) ([add9557](https://github.com/achingbrain/nat-port-mapper/commit/add9557e2a500a019ae3fad945c6a0e23e490e9e)), closes [#67](https://github.com/achingbrain/nat-port-mapper/issues/67)
* lower minimum ttl to one minute ([#70](https://github.com/achingbrain/nat-port-mapper/issues/70)) ([07e2c41](https://github.com/achingbrain/nat-port-mapper/commit/07e2c41bd6b6986dd35cc215363e88526bf1a788)), closes [#66](https://github.com/achingbrain/nat-port-mapper/issues/66)
* update deps ([#69](https://github.com/achingbrain/nat-port-mapper/issues/69)) ([aa85f31](https://github.com/achingbrain/nat-port-mapper/commit/aa85f3177e27b39258f0323db0059e63f19459de))

## [1.0.14](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.13...v1.0.14) (2024-09-12)


### Dependencies

* **dev:** bump aegir from 41.3.5 to 42.2.5 ([#64](https://github.com/achingbrain/nat-port-mapper/issues/64)) ([45d46f9](https://github.com/achingbrain/nat-port-mapper/commit/45d46f9c3970b764667be7854b7f3fcddc555b6d))

## [1.0.13](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.12...v1.0.13) (2023-12-01)


### Dependencies

* bump @libp2p/logger from 3.1.0 to 4.0.1 ([#54](https://github.com/achingbrain/nat-port-mapper/issues/54)) ([5f9092b](https://github.com/achingbrain/nat-port-mapper/commit/5f9092bbd9d65251da5bfcfbeee18518522e9b23))

## [1.0.12](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.11...v1.0.12) (2023-10-18)


### Dependencies

* **dev:** bump aegir from 40.0.13 to 41.0.5 ([#52](https://github.com/achingbrain/nat-port-mapper/issues/52)) ([3fb4046](https://github.com/achingbrain/nat-port-mapper/commit/3fb404674cbb0958d92739c8b245c2de7c6aa33f))

## [1.0.11](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.10...v1.0.11) (2023-08-03)


### Dependencies

* bump default-gateway from 6.0.3 to 7.2.2 ([#42](https://github.com/achingbrain/nat-port-mapper/issues/42)) ([19f33ea](https://github.com/achingbrain/nat-port-mapper/commit/19f33eafa2b91fc68100a703555c72f9a3ab4dee))

## [1.0.10](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.9...v1.0.10) (2023-08-03)


### Dependencies

* bump @libp2p/logger from 2.1.1 to 3.0.0 ([#47](https://github.com/achingbrain/nat-port-mapper/issues/47)) ([6b57fe9](https://github.com/achingbrain/nat-port-mapper/commit/6b57fe977d9886e8619081a3d4a7fec28b5aaaaa))
* **dev:** bump aegir from 39.0.13 to 40.0.8 ([#48](https://github.com/achingbrain/nat-port-mapper/issues/48)) ([fa0e9b2](https://github.com/achingbrain/nat-port-mapper/commit/fa0e9b21d8ecd3bf1888453252d7b290f26d624b))

## [1.0.9](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.8...v1.0.9) (2023-06-07)


### Bug Fixes

* expose mapped ports on client object ([#40](https://github.com/achingbrain/nat-port-mapper/issues/40)) ([7016f94](https://github.com/achingbrain/nat-port-mapper/commit/7016f945e9e6b4d0b0d808132acf2547b0adad3e))


### Dependencies

* bump xml2js from 0.5.0 to 0.6.0 ([#39](https://github.com/achingbrain/nat-port-mapper/issues/39)) ([902f37b](https://github.com/achingbrain/nat-port-mapper/commit/902f37b34e822fb39b4a9630c77190d499879ef2))


### Trivial Changes

* **deps-dev:** bump aegir from 37.12.1 to 39.0.1 ([#38](https://github.com/achingbrain/nat-port-mapper/issues/38)) ([f74f8f0](https://github.com/achingbrain/nat-port-mapper/commit/f74f8f04e03d79e8c6108eb1c64aa3c8de668647))
* **deps:** bump p-timeout from 5.1.0 to 6.1.1 ([#41](https://github.com/achingbrain/nat-port-mapper/issues/41)) ([a2e7aa0](https://github.com/achingbrain/nat-port-mapper/commit/a2e7aa047558aaeefde71c69fbe0348e9d778e11))

## [1.0.8](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.7...v1.0.8) (2023-04-27)


### Trivial Changes

* **deps:** bump it-first from 1.0.7 to 3.0.1 ([#35](https://github.com/achingbrain/nat-port-mapper/issues/35)) ([7cb683d](https://github.com/achingbrain/nat-port-mapper/commit/7cb683d4dc163da9619137e3e8278283b558ad1c))
* **deps:** bump xml2js from 0.4.23 to 0.5.0 ([#37](https://github.com/achingbrain/nat-port-mapper/issues/37)) ([4abf459](https://github.com/achingbrain/nat-port-mapper/commit/4abf459c36afcdd17e545e7a3346c65e921f4f60))
* **deps:** Updated xml2js to 0.5.0 to patch CVE-2023-0842 ([#36](https://github.com/achingbrain/nat-port-mapper/issues/36)) ([432fd61](https://github.com/achingbrain/nat-port-mapper/commit/432fd61775a46ff343726cf3296511863c7de8bd))

## [1.0.7](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.6...v1.0.7) (2022-06-16)


### Trivial Changes

* **deps:** bump @libp2p/logger from 1.1.6 to 2.0.0 ([#18](https://github.com/achingbrain/nat-port-mapper/issues/18)) ([22a9b05](https://github.com/achingbrain/nat-port-mapper/commit/22a9b059a23abb649d5658c272a5b067bc971261))

### [1.0.6](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.5...v1.0.6) (2022-05-26)


### Bug Fixes

* shut down cleanly ([#17](https://github.com/achingbrain/nat-port-mapper/issues/17)) ([8a157c4](https://github.com/achingbrain/nat-port-mapper/commit/8a157c4223ac1d19b5d05d6ef3372a0e129ff790))

### [1.0.5](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.4...v1.0.5) (2022-05-20)


### Bug Fixes

* add error listener to ssdp ([#16](https://github.com/achingbrain/nat-port-mapper/issues/16)) ([afafb69](https://github.com/achingbrain/nat-port-mapper/commit/afafb6993bbfc62030091ad7099e464035282168))

### [1.0.4](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.3...v1.0.4) (2022-05-19)


### Bug Fixes

* cache resolved gateway until timeout ([#15](https://github.com/achingbrain/nat-port-mapper/issues/15)) ([1ad50c3](https://github.com/achingbrain/nat-port-mapper/commit/1ad50c34a1a5889bc3271073d85abdfe3e565b1f)), closes [#14](https://github.com/achingbrain/nat-port-mapper/issues/14)

### [1.0.3](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.2...v1.0.3) (2022-05-18)


### Bug Fixes

* clear timeouts and shut down servers ([#14](https://github.com/achingbrain/nat-port-mapper/issues/14)) ([9219952](https://github.com/achingbrain/nat-port-mapper/commit/9219952244710555e93d72679f50956e411517b6))

### [1.0.2](https://github.com/achingbrain/nat-port-mapper/compare/v1.0.1...v1.0.2) (2022-05-17)


### Bug Fixes

* update xml2js parser options ([#2](https://github.com/achingbrain/nat-port-mapper/issues/2)) ([#13](https://github.com/achingbrain/nat-port-mapper/issues/13)) ([389c2f2](https://github.com/achingbrain/nat-port-mapper/commit/389c2f2ecfad84ae61ee4f6dc3d457c32f3b2e77))

### [1.0.1](https://github.com/achingbrain/upnp-nat/compare/v1.0.0...v1.0.1) (2022-03-11)


### Bug Fixes

* browser shim ([#3](https://github.com/achingbrain/upnp-nat/issues/3)) ([6d095f8](https://github.com/achingbrain/upnp-nat/commit/6d095f84f10e0da1c2f5b1b6a38cbb01eea123ba))

## 1.0.0 (2022-02-27)


### ⚠ BREAKING CHANGES

* switch to named exports, ESM only

### Features

* convert to typescript ([#2](https://github.com/achingbrain/upnp-nat/issues/2)) ([e46bb43](https://github.com/achingbrain/upnp-nat/commit/e46bb43225a1c717bb2ed1bc8527ab66fe164a11))


### Bug Fixes

* pass a noop as a callback to bound functions ([9996370](https://github.com/achingbrain/upnp-nat/commit/999637035a460679cdf71c8b2561a0c84982f07a)), closes [#24](https://github.com/achingbrain/upnp-nat/issues/24)
