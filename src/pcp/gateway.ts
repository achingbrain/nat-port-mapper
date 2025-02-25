import { createSocket } from 'dgram'
import { EventEmitter } from 'events'
import { isIPv4 } from '@chainsafe/is-ip'
import { parseIP } from '@chainsafe/is-ip/parse'
import { logger } from '@libp2p/logger'
import errCode from 'err-code'
import defer, { type DeferredPromise } from 'p-defer'
import { raceSignal } from 'race-signal'
import { DEFAULT_REFRESH_TIMEOUT } from '../upnp/constants.js'
import { findLocalAddresses, isPrivateIp } from '../utils.js'
import { Mappings, type Mapping } from './mappings.js'
import type { Gateway, GlobalMapPortOptions, PortMapping, PCPMapPortOptions } from '../index.js'
import type { AbortOptions } from 'abort-error'
import type { Socket, RemoteInfo } from 'dgram'

// rfc6887 definitions
// const CLIENT_PORT = 5350
const SERVER_PORT = 5351
const PCP_VERSION = 2

// Opcodes
const OP_ANNOUNCE = 0
const OP_MAP = 1
// const OP_PEER = 2

// Bits
const RESERVED_BIT = 0

// Protocols
const PROTO_TCP = 0x06
const PROTO_UDP = 0x11

const EMPTY_IPV4 = '0.0.0.0'
const EMPTY_IPV6 = '0000:0000:0000:0000:0000:0000:0000:0000'

const MINIMUM_LIFETIME = 120 // seconds
const DEFAULT_PCP_PORT_MAPPING_TTL = 60 * 60 // 1 hour
const REFRESH_INTERVAL = 15_000 // run refresher every 15 seconds

// EPOCH_DRIFT in seconds to account for clock drift
const EPOCH_DRIFT = 10

// Result codes - https://www.rfc-editor.org/rfc/rfc6887#section-7.4
const RESULT_SUCCESS = 0
const RESULT_CODES: Record<number, string> = {
  0: 'Success',
  1: 'Unsupported version', // generally indicates that the client should fall back to using NAT-PMP
  2: 'Not authorized - gateway may have PCP disabled',
  3: 'Malformed request',
  4: 'Unsupported opcode',
  5: 'Unsupported option',
  6: 'Malformed option',
  7: 'Network failure',
  8: 'No resources',
  9: 'Unsupported protocol',
  10: 'Exceeded port quota',
  11: 'External port and/or external address cannot be provided',
  12: 'Address mismatch: Source IP does not match the PCP client address. This may be due to an incorrect source IP (e.g. deprecated IPv6 privacy address) or NAT between the client and server',
  13: 'Excessive remote peers'
}

const log = logger('nat-port-mapper:pcp')

interface Callback {
  (err?: Error, parsed?: any): void
}

export class PCPGateway extends EventEmitter implements Gateway {
  public id: string
  private readonly clientSocket: Socket
  private queue: Array<{ op: number, buf: Uint8Array, deferred: DeferredPromise<any>, localPort?: number, obj?: PCPMapPortOptions }>
  private connecting: boolean
  private listening: boolean
  private req: any
  private reqActive: boolean
  public readonly host: string
  public readonly port: number
  public readonly family: 'IPv4' | 'IPv6'
  private readonly options: GlobalMapPortOptions
  private readonly autoRefresher: ReturnType<typeof setInterval> | undefined
  private readonly mappings: Mappings
  private gatewayEpoch: number | undefined // Unix timestamp in seconds of when the PCP server was started

  constructor (gatewayIP: string, options: GlobalMapPortOptions = {}) {
    super()

    this.queue = []
    this.connecting = false
    this.listening = false
    this.req = null
    this.reqActive = false
    this.host = gatewayIP
    this.port = SERVER_PORT
    this.family = isIPv4(gatewayIP) ? 'IPv4' : 'IPv6'
    this.id = this.host
    // this.refreshIntervals = new Map()
    this.mappings = new Mappings()
    this.options = options

    // PCP uses seconds for its TTL
    if (this.options?.ttl !== undefined) {
      this.options.ttl = Math.floor(this.options.ttl / 1000)

      if (this.options.ttl < MINIMUM_LIFETIME) {
        this.options.ttl = MINIMUM_LIFETIME
      }
    }

    this.autoRefresher = this.refresher()

    // clientSocket sends ANNOUNCE and MAP messages and handles responses
    this.clientSocket = this.newClientSocket()

    this.connect()
  }

  public async * mapAll (internalPort: number, options: PCPMapPortOptions): AsyncGenerator<PortMapping, void, unknown> {
    let mapped = false

    for (const host of findLocalAddresses(this.family)) {
      try {
        log('mapping host', host)
        options.internalAddress = host
        const mapping = await this.map(internalPort, host, options)
        mapped = true

        yield mapping
      } catch (err) {
        log.error('error mapping %s:%d - %e', host, internalPort, err)
      }
    }

    if (!mapped) {
      throw new Error(`All attempts to map port ${internalPort} failed`)
    }
  }

  public async map (internalPort: number, internalHost: string, opts: PCPMapPortOptions): Promise<PortMapping> {
    const options = {
      internalAddress: internalHost,
      publicPort: opts?.suggestedExternalPort ?? internalPort,
      publicHost: opts?.suggestedExternalAddress ?? '',
      protocol: opts?.protocol ?? 'TCP',
      ttl: opts?.ttl ?? this.options.ttl ?? DEFAULT_PCP_PORT_MAPPING_TTL,
      autoRefresh: opts?.autoRefresh ?? this.options.autoRefresh ?? true,
      refreshTimeout: opts?.refreshTimeout ?? this.options.refreshTimeout ?? DEFAULT_REFRESH_TIMEOUT
    }

    log('Client#portMapping()')
    switch (options.protocol.toUpperCase()) {
      case 'TCP':
      case 'UDP':
        break
      default:
        throw new Error('"type" must be either "tcp" or "udp"')
    }

    const deferred = defer<{ resultCode: number, internalHost: string, internalPort: number, externalAddress: string, externalPort: number, lifetime: number, protocol: 'TCP' | 'UDP' }>()

    this.request(OP_MAP, deferred, internalPort, options)

    let result
    try {
      result = await raceSignal(deferred.promise, opts?.signal)
    } catch (e: any) {
      this.mappings.delete(internalHost, internalPort, options.protocol)
      throw e
    }

    return {
      externalHost: isPrivateIp(internalHost) === true ? await this.externalIp(opts) : internalHost,
      externalPort: result.externalPort,
      internalHost,
      internalPort: result.internalPort,
      protocol: result.protocol
    }
  }

  // unmap attempts to remove a mapping. However, if the host has sent traffic
  // recently (within the servers idle-timeout period), the mapping isn’t
  // immediately deleted. Instead, the mapping’s lifetime is set to the
  // remaining idle-timeout period.
  // https://www.rfc-editor.org/rfc/rfc6887#section-15
  public async unmap (localPort: number, opts: PCPMapPortOptions): Promise<void> {
    log('Client#portUnmapping()')

    await this.map(localPort, opts.internalAddress, {
      ...opts,
      autoRefresh: false,
      ttl: 0
    })
  }

  // remap attempts to remap all mappings - runs when a PCP servers epoch
  // changes, e.g. after the PCP server reboots or its public IP changes
  public async remap (): Promise<void> {
    log('Client#remap()')

    try {
      await Promise.allSettled(this.mappings.getAll().map(async (m) => {
        const opts: PCPMapPortOptions = {
          internalAddress: m.internalHost,
          suggestedExternalAddress: m.externalHost,
          suggestedExternalPort: m.externalPort,
          protocol: m.protocol,
          autoRefresh: m.autoRefresh
        }

        return this.map(m.internalPort, m.internalHost, opts)
      }))
    } catch (e) {
      log('Could not remap', e)
    }
  }

  public getMappings (): Mapping[] {
    return this.mappings.getAll()
  }

  // externalIp creates a short lived map to get the external IP as per
  // https://www.rfc-editor.org/rfc/rfc6887#section-11.6.
  // It should be OK for residential NATs but CGNATs may use a pool of
  // addresses so the external address isn't guaranteed.
  public async externalIp (options?: AbortOptions): Promise<string> {
    for (const host of findLocalAddresses(this.family)) {
      const opts: PCPMapPortOptions = {
        internalAddress: host,
        ttl: MINIMUM_LIFETIME,
        autoRefresh: false,
        protocol: 'TCP',
        ...options
      }

      let externalIp: string | undefined

      try {
        // https://www.rfc-editor.org/rfc/rfc6887#section-11.6 suggests using
        // discard port (9) but there may be restrictions on well-known
        // (0-1023) ports, so just use an ephemeral port (49152-65535) instead.
        const mapping = await this.map(this.getEphemeralPort(), host, opts)
        externalIp = mapping.externalHost
      } catch (e: any) {
        log(e)
      }

      if (externalIp !== undefined) {
        return externalIp
      }
    }

    throw new Error('Could not lookup external IP')
  }

  public async isPCPSupported (): Promise<void> {
    await this.announce()
  }

  public async stop (options?: AbortOptions): Promise<void> {
    log('Client#close()')

    if (this.autoRefresher !== undefined) {
      clearInterval(this.autoRefresher)
    }

    this.queue = []

    try {
      await Promise.allSettled(this.mappings.getAll().map(async (m) => {
        const opts: PCPMapPortOptions = {
          internalAddress: m.internalHost,
          ...options
        }
        return this.unmap(m.internalPort, opts)
      }))
    } catch (e) {
      log('Could not unmap on close', e)
    }

    this.queue = []
    this.connecting = false
    this.listening = false
    this.req = null
    this.reqActive = false
    this.mappings.deleteAll()

    if (this.clientSocket != null) {
      this.clientSocket.close()
    }
  }

  private newClientSocket (): Socket {
    let socket: Socket
    if (this.family === 'IPv4') {
      socket = createSocket({ type: 'udp4', reuseAddr: true })
    } else if (this.family === 'IPv6') {
      socket = createSocket({ type: 'udp6', reuseAddr: true })
    } else {
      throw new Error('unknown gateway address type')
    }

    socket.on('listening', () => { this.onListening() })
    socket.on('message', (msg, rinfo) => { this.onMessage(msg, rinfo) })
    socket.on('close', () => { this.onClose() })
    socket.on('error', (err) => { this.onError(err) })

    return socket
  }

  private connect (): void {
    log('Client#connect()')
    if (this.connecting) return
    this.connecting = true
    this.clientSocket.bind(0) // use a random port https://www.rfc-editor.org/rfc/rfc6887#section-8.1
  }

  private onListening (): void {
    log('Client#onListening()')
    this.listening = true
    this.connecting = false

    // Try to send next message
    this._next()
  }

  private onClose (): void {
    log('Client#onClose()')
    this.listening = false
    this.connecting = false
  }

  private onError (err: Error): void {
    log('Client#onError()', [err])
    if (this.req?.cb != null) {
      this.req.cb(err)
    } else {
      this.emit('error', err)
    }

    if (this.clientSocket != null) {
      this.clientSocket.close()
      this.onClose()
    }
  }

  private onMessage (msg: Buffer, rinfo: RemoteInfo): void {
    log('Client#onMessage()', [msg, rinfo])

    // Message handling https://www.rfc-editor.org/rfc/rfc6887#section-8.3
    if (rinfo.address.toLowerCase() !== this.host.toLowerCase()) {
      log(`Ignoring PCP message - not sent by configured gateway ${rinfo.address}`)
      return
    }

    if (rinfo.port !== SERVER_PORT) {
      log(`Ignoring PCP message - not sent from port ${SERVER_PORT}`)
      return
    }

    // Reject messages that have invalid lengths
    if (msg.length < 24 || msg.length > 1100 || msg.length % 4 !== 0) {
      log(`Ignoring PCP message - invalid length ${msg.length}`)
      return
    }

    // Ignore message if we're not expecting it
    if (this.queue.length === 0) {
      return
    }

    const cb: Callback = (err?: Error, parsed?: any): void => {
      this.req = null
      this.reqActive = false

      if (err != null) {
        if (req.deferred != null) {
          req.deferred.reject(err)
        } else {
          this.emit('error', err)
        }
      } else if (req.deferred != null) {
        req.deferred.resolve(parsed)
      }

      // Try to send next message
      this._next()
    }

    const req = this.queue[0]
    const parsed: any = { msg }

    // PCP response header layout (24 bytes)
    // https://www.rfc-editor.org/rfc/rfc6887#section-7.2
    // Byte [0]:       Version (1 byte)
    // Byte [1]:       Request/Response(1 bit) + Opcode(7 bits) (1 byte)
    // Byte [2]:       Reserved (1 byte)
    // Byte [3]:       Result code(1 byte)
    // Bytes [4..7]:   Lifetime (4 bytes)
    // Bytes [8..11]:  Epoch time (4 bytes)
    // Bytes [12..23]: Reserved (12 bytes)
    // Bytes [24..]    Optional Opcode specific

    parsed.vers = msg.readUInt8(0)

    parsed.r = (msg.readUint8(1) >> 7) & 0x01
    if (parsed.r !== 1) {
      log(`Ignoring PCP message - "R" must be 1. Got: ${parsed.r}`)
      return
    }

    parsed.op = msg.readUint8(1) & 0x7F

    if (parsed.op !== req.op) {
      log('Ignoring PCP message - unexpected message opcode', parsed.op)
      return
    }

    // if we got here, then we're gonna invoke the request's callback,
    // so shift this request off of the queue.
    log('removing "req" off of the queue')
    this.queue.shift()

    if (parsed.vers !== PCP_VERSION) {
      cb(new Error(`"vers" must be ${PCP_VERSION}. Got: ${parsed.vers}`)) // eslint-disable-line @typescript-eslint/restrict-template-expressions
      return
    }

    // skip byte 2 - reserved

    parsed.resultCode = msg.readUInt8(3)
    if (!(parsed.resultCode in RESULT_CODES)) {
      cb(errCode(new Error('Unsupported result code'), parsed.resultCode))
      return
    }

    parsed.resultMessage = RESULT_CODES[parsed.resultCode]
    if (parsed.resultCode !== RESULT_SUCCESS) {
      // @TODO - if resultCode is UNSUPP_VERSION and PCP_VERSION is 0, client MAY fallback to NAT-PMP
      // https://www.rfc-editor.org/rfc/rfc6887#section-9
      cb(errCode(new Error(parsed.resultMessage), parsed.resultCode))
      return
    }

    parsed.lifetime = msg.readUInt32BE(4)
    // Check for large lifetimes, https://www.rfc-editor.org/rfc/rfc6887#section-15
    if (parsed.lifetime > 24 * 60 * 60) {
      log(`PCP server allocated a ${parsed.lifetime}s lifetime which is larger 24 hours, setting to 24 hours`)
      parsed.lifetime = 24 * 60 * 60
    }

    parsed.epoch = msg.readUInt32BE(8)
    if (this.hasEpochChanged(parsed.epoch)) {
      void this.remap()
    }

    this.gatewayEpoch = Math.floor(Date.now() / 1000) - parsed.epoch

    // skip byte 12 - 23 - reserved

    // Success
    switch (req.op) {
      case OP_ANNOUNCE: {
        // OP_ANNOUNCE has no additional data to decode
        log('parsed', parsed)
        break
      }
      case OP_MAP: {
        this.processPCPMapResponse(msg, parsed, cb, req.localPort, req.obj)
        break
      }
      default: {
        cb(new Error(`Unsupported opcode: ${req.op}`))
        return
      }
    }

    cb(undefined, parsed)
  }

  private newPCPRequestHeader (clientIP: string, ttl: number, opcode: number): Buffer {
    // PCP request header layout (24 bytes):
    // https://www.rfc-editor.org/rfc/rfc6887#section-7.1
    // Byte [0]:      Version (1 byte)
    // Byte [1]:      Request/Response(1 bit) + Opcode(7 bits) (1 byte)
    // Bytes [2..3]:  Reserved (2 bytes)
    // Bytes [4..7]:  Lifetime (4 bytes)
    // Bytes [8..23]: Client IP (16 bytes)

    const size = 24
    let pos = 0

    const buf = Buffer.alloc(size)
    buf.writeUInt8(PCP_VERSION, pos)
    pos++

    buf.writeUInt8(((RESERVED_BIT << 7) | (opcode & 0x7F)) & 0xFF, pos)
    pos++

    buf.writeUInt16BE(0, pos) // reserved
    pos += 2

    buf.writeUInt32BE(ttl, pos) // lifetime
    pos += 4

    const ipBuf = parseIP(clientIP, true)
    if (ipBuf === undefined) {
      throw new Error('Could not parse IP')
    }

    buf.set(ipBuf, pos)

    return buf
  }

  private pcpRequestMAPPacket (localPort: number, obj: PCPMapPortOptions): Buffer {
    if (obj == null) {
      throw new Error('mapping a port requires an "options" object')
    }

    if (obj.protocol === undefined || obj.protocol === null) {
      throw new Error('protocol required')
    }

    let ttl

    ttl = Number(obj.ttl ?? this.options.ttl ?? 0)
    if (ttl !== (ttl | 0)) {
      // Set the Port Mapping Lifetime to the minimum of 120 seconds
      ttl = MINIMUM_LIFETIME
    }

    // PCP MAP request layout (36 bytes)
    // https://www.rfc-editor.org/rfc/rfc6887#section-11.1
    // Byte [0-11]:  Mapping nonce (12 byte)
    // Byte [12]:    Protocol (1 byte)
    // Byte [13-15]: Reserved (3 byte)
    // Byte [16-17]: Internal Port (2 byte)
    // Byte [18-19]: Suggested External Port (2 byte)
    // Byte [20-35]: Suggested External IP (16 byte)

    let pos = 0
    const size = 24 + 36 // PCP header + MAP op
    const buf = Buffer.alloc(size)

    const header = this.newPCPRequestHeader(obj.internalAddress, ttl, OP_MAP)

    header.copy(buf, pos, 0, 24)
    pos = 24

    // Mapping nonce
    const mappingNonce = this.mappings.getOrCreate(obj.internalAddress, localPort, obj.protocol, obj.autoRefresh)
    mappingNonce.nonce.copy(buf, pos, 0, 12)
    pos += 12

    // Protocol
    if (obj.protocol === 'udp' || obj.protocol === 'UDP') {
      buf.writeUInt8(PROTO_UDP, pos)
    } else if (obj.protocol === 'tcp' || obj.protocol === 'TCP') {
      buf.writeUInt8(PROTO_TCP, pos)
    } else {
      throw new Error('unsupported protocol')
    }
    pos++

    // Reserved
    buf.writeUInt8(OP_MAP, pos)
    buf.writeUInt16BE(0, pos)
    pos += 3

    // Internal Port
    buf.writeUInt16BE(localPort, pos)
    pos += 2

    // Suggested External Port
    buf.writeUInt16BE(obj.suggestedExternalPort ?? localPort, pos)
    // buf.writeUInt16BE(1234, pos)
    pos += 2

    // Suggested external IP
    let suggestedIP: Uint8Array | undefined

    if (obj.suggestedExternalAddress !== undefined && obj.suggestedExternalAddress !== null) {
      suggestedIP = parseIP(obj.suggestedExternalAddress, true)
    } else {
      if (isIPv4(obj.internalAddress)) {
        suggestedIP = parseIP(EMPTY_IPV4, true)
      } else {
        suggestedIP = parseIP(EMPTY_IPV6, true)
      }
    }

    if (suggestedIP === undefined) {
      throw new Error('Could not parse IP')
    }

    buf.set(suggestedIP, pos)

    return buf
  }

  private pcpRequestANNOUNCEPacket (obj: PCPMapPortOptions): Buffer {
    return this.newPCPRequestHeader(obj.internalAddress, 0, OP_ANNOUNCE)
  }

  private processPCPMapResponse (msg: Buffer, parsed: any, cb: Callback, localPort?: number, obj?: PCPMapPortOptions): void {
    // PCP MAP response layout (36 bytes) + (24 byte header)
    // https://www.rfc-editor.org/rfc/rfc6887#section-11.1
    // Byte [0..11]:   Mapping Nonce (12 byte)
    // Byte [12]:      Protocol (1 byte)
    // Byte [13..15]:  Reserved (3 bytes)
    // Byte [16..17]:  Internal port (2 bytes)
    // Bytes [18..19]: External port (2 bytes)
    // Bytes [20..35]: Assigned External IP Address (16 bytes)

    if (msg.length < 60) {
      cb(new Error('PCP MAP response too short'))
      return
    }

    parsed.nonce = Buffer.alloc(12, 0)
    msg.copy(parsed.nonce, 0, 24, 36)
    if (this.mappings.getByNonce(parsed.nonce) === undefined) {
      cb(new Error('Nonce not found in mappings'))
      return
    }

    const protocol = msg.readUint8(36)
    if (protocol === PROTO_TCP) {
      parsed.protocol = 'TCP'
    } else if (protocol === PROTO_UDP) {
      parsed.protocol = 'UDP'
    } else {
      cb(new Error(`Unsupported protocol: ${parsed.protocol}`))
      return
    }

    if (obj?.protocol?.toUpperCase() !== parsed.protocol.toUpperCase()) {
      cb(new Error(`Unexpected protocol - expected: ${obj?.protocol?.toUpperCase()}, received: ${parsed.protocol.toUpperCase()}`))
      return
    }

    parsed.internalPort = msg.readUInt16BE(40)
    if (localPort !== parsed.internalPort) {
      cb(new Error(`Unexpected internal port - expected: ${localPort}, received: ${parsed.internalPort}`))
      return
    }

    parsed.externalPort = msg.readUInt16BE(42)

    parsed.externalAddress = Buffer.alloc(16, 0)
    msg.copy(parsed.externalAddress, 0, 44, 60)

    const updated = this.mappings.update(parsed.internalPort, parsed.protocol, parsed.nonce, parsed.externalAddress, parsed.externalPort, (Math.floor(Date.now() / 1000) + parsed.lifetime) * 1000, parsed.lifetime)
    if (!updated) {
      cb(new Error(`Could not find mapping for ${parsed.internalPort}, ${parsed.type}, ${parsed.nonce.toString('hex')}`))
      return
    }

    log('parsed', parsed)
  }

  // announce sends a PCP ANNOUNCE message to the gateway device.
  // This is used to determine:
  //   - if the gateway supports PCP
  //   - the gateway epoch
  private async announce (): Promise<void> {
    log('Sending client PCP ANNOUNCE message')
    let success = false

    const addresses = findLocalAddresses(this.family)
    for (const address of addresses) {
      log('Announcing with address: ', address)
      const options: PCPMapPortOptions = {
        internalAddress: address,
        ttl: 0,
        autoRefresh: false
      }

      const port = 0
      const deferred = defer<{ epoch: number }>()
      this.request(OP_ANNOUNCE, deferred, port, options)

      try {
        await raceSignal(deferred.promise, AbortSignal.timeout(3000))
        log(`PCP ANNOUNCE sent successfully using address: ${address}`)

        success = true
        break
      } catch (err) {
        log.error(`Failed to send client PCP ANNOUNCE using address ${address}: %e`, err)
        continue
      }
    }

    if (!success) {
      throw new Error('No PCP server found')
    }
  }

  /**
   * Queues a UDP request to be sent to the gateway device.
   */
  private request (op: typeof OP_ANNOUNCE | typeof OP_MAP, deferred: DeferredPromise<any>, localPort: number, obj: PCPMapPortOptions): void {
    log('Client#request()', [op, obj])

    let buf

    switch (op) {
      case OP_ANNOUNCE: {
        buf = this.pcpRequestANNOUNCEPacket(obj)
        break
      }
      case OP_MAP: {
        buf = this.pcpRequestMAPPacket(localPort, obj)
        break
      }
      default:
        throw new Error(`Unsupported opcode: ${op}`)
    }

    // Add it to queue
    this.queue.push({ op, buf, deferred, localPort, obj })

    // Try to send next message
    this._next()
  }

  /**
   * Processes the next request if the clientSocket is listening.
   */
  private _next (): void {
    log('Client#_next()')

    const req = this.queue[0]

    if (req == null) {
      log('_next: nothing to process')
      return
    }

    if (this.clientSocket == null) {
      log('_next: client is closed')
      return
    }

    if (!this.listening) {
      log('_next: not "listening" yet, cannot send out request yet')

      if (!this.connecting) {
        this.connect()
      }

      return
    }

    if (this.reqActive) {
      log('_next: already an active request so wait...')
      return
    }

    this.reqActive = true
    this.req = req

    const buf = req.buf

    log('_next: sending request', buf, this.host)
    this.clientSocket.send(buf, 0, buf.length, SERVER_PORT, this.host)
  }

  // refresher runs every REFRESH_INTERVAL seconds to renew mappings that are
  // expiring. We slightly deviate from the SHOULD spec here and just run a
  // single refresh function for all expiring mapping. It simplifies clean up
  // and retry logic. It still conforms to the four seconds constraint and
  // doesn't flood the server.
  // We class a mapping as expiring when it has less than half of total lifetime
  // remaining. https://www.rfc-editor.org/rfc/rfc6887#section-11.2.1
  private refresher (): NodeJS.Timeout {
    return setInterval(() => {
      log('Client#autoRefresher')
      void this.refreshMappings()
    }, REFRESH_INTERVAL)
  }

  private async refreshMappings (): Promise<void> {
    try {
      await Promise.allSettled(
        this.mappings.getExpiring().map(async (m) => {
          const opts: PCPMapPortOptions = {
            internalAddress: m.internalHost,
            suggestedExternalAddress: m.externalHost,
            suggestedExternalPort: m.externalPort,
            protocol: m.protocol,
            autoRefresh: m.autoRefresh
          }
          return this.map(m.internalPort, m.internalHost, opts)
        })
      )
    } catch (e) {
      log('Could not refresh', e)
    }
  }

  private getEphemeralPort (): number {
    const min = 49152
    const max = 65535
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  // hasEpochChanged calculates if the server epoch has changed, taking into
  // account a small clock drift. Indicates if the PCP server has restarted.
  private hasEpochChanged (epoch: number): boolean {
    if (this.gatewayEpoch === undefined) {
      return false
    }

    const newEpoch = Math.floor(Date.now() / 1000) - epoch

    // older PCP server epoch, so invalid.
    if (newEpoch < this.gatewayEpoch) {
      return true
    }

    const delta = Math.abs(newEpoch - this.gatewayEpoch)

    if (delta > EPOCH_DRIFT) {
      return true
    }

    return false
  }
}
