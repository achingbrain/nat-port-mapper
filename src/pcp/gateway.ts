import { randomBytes } from 'crypto'
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
import type { Gateway, GlobalMapPortOptions, PortMapping, PCPMapPortOptions, Protocol } from '../index.js'
import type { AbortOptions } from 'abort-error'
import type { Socket, RemoteInfo } from 'dgram'

const log = logger('nat-port-mapper:pcp')

// Ports defined by rfc6887
const CLIENT_PORT = 5350
const SERVER_PORT = 5351

// Version defined by rfc6887
const PCP_VERSION = 2

// Opcodes
const OP_ANNOUNCE = 0
const OP_MAP = 1
// const OP_PEER = 2 // unsupported

// Bits
const RESERVED_BIT = 0

// Protocols
const PROTO_TCP = 0x06
const PROTO_UDP = 0x11

const MULTICAST_IPV4 = '224.0.0.1'
const MULTICASE_IPV6 = 'ff02:0000:0000:0000:0000:0000:0000:0001'
const EMPTY_IPV4 = '0.0.0.0'
const EMPTY_IPV6 = '0000:0000:0000:0000:0000:0000:0000:0000'
const MINIMUM_LIFETIME = 120

const DEFAULT_PCP_PORT_MAPPING_TTL = 60 * 60 // 1 hour

// EPOCH_DRIFT in seconds to account for clock drift
const EPOCH_DRIFT = 10

// Result codes - https://www.rfc-editor.org/rfc/rfc6887#section-7.4
const RESULT_SUCCESS = 0
const RESULT_CODES: Record<number, string> = {
  0: 'Success',
  1: 'Unsupported Version', // generally indicates that the client should fall back to using NAT-PMP
  2: 'Not Authorized/Refused (gateway may have NAT-PCP disabled)',
  3: 'Malformed request',
  4: 'Unsupported opcode',
  5: 'Unsupported option',
  6: 'Malformed option',
  7: 'Network failure',
  8: 'No resources',
  9: 'Unsupported protocol',
  10: 'Exceeded port quota',
  11: 'External port and/or external address cannot be provided',
  12: 'Address mismatch. Source IP address does not match requested PCP client address. Possibly using the wrong IP address e.g. IPv6 deprecated addresses or there is a NAT between the client and server',
  13: 'Excessive remote peers'
}

interface Mapping {
  protocol: Protocol
  internalHost: string
  internalPort: number
  externalHost?: string
  externalPort?: number
  nonce: Buffer
  expiresAt?: number
}

interface Callback {
  (err?: Error, parsed?: any): void
}

export class PCPGateway extends EventEmitter implements Gateway {
  public id: string
  private readonly clientSocket: Socket
  private readonly unicastAnnounceSocket: Socket
  private readonly multicastAnnounceSocket: Socket
  private queue: Array<{ op: number, buf: Uint8Array, deferred: DeferredPromise<any> }>
  private connecting: boolean
  private listening: boolean
  private req: any
  private reqActive: boolean
  public readonly host: string
  public readonly port: number
  public readonly family: 'IPv4' | 'IPv6'
  private readonly options: GlobalMapPortOptions
  private readonly refreshIntervals: Map<number, ReturnType<typeof setTimeout>>
  private mappings: Mapping[]
  private gatewayEpoch: number | undefined
  public lastGoodIPAddress: string = ''

  constructor (gateway: string, options: GlobalMapPortOptions = {}) {
    super()

    this.queue = []
    this.connecting = false
    this.listening = false
    this.req = null
    this.reqActive = false
    this.host = gateway
    this.port = SERVER_PORT
    this.family = isIPv4(gateway) ? 'IPv4' : 'IPv6'
    this.id = this.host
    this.options = options
    this.refreshIntervals = new Map()
    this.mappings = []

    // this.options.ttl = this.options.ttl / 1000

    // unicastAnnounceSocket handles restart ANNOUNCE messages from PCP server
    this.unicastAnnounceSocket = this.newUnicastAnnounceSocket()

    // multicastAnnounceSocket receives restart ANNOUNCE messages from PCP server
    this.multicastAnnounceSocket = this.newMulticastAnnounceSocket()

    // clientSocket sends ANNOUNCE and MAP messages and handles responses
    this.clientSocket = this.newClientSocket()

    this.connect()

    this.announce()
      .then(() => {
        log('ANNOUNCE sent successfully')
      })
      .catch(err => {
        // XXX ok to throw in the constructor?
        log.error('Failed to send ANNOUNCE:', err)
        throw err
      })
  }

  newClientSocket (): Socket {
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

  newMulticastAnnounceSocket (): Socket {
    let socket: Socket
    let multicastAddr: string
    if (this.family === 'IPv4') {
      socket = createSocket({ type: 'udp4', reuseAddr: true })
      multicastAddr = MULTICAST_IPV4
    } else if (this.family === 'IPv6') {
      socket = createSocket({ type: 'udp6', reuseAddr: true })
      multicastAddr = MULTICASE_IPV6
    } else {
      throw new Error('unknown gateway address type')
    }

    socket.bind(CLIENT_PORT, () => {
      socket.addMembership(multicastAddr)
      log(`Socket bound to port ${CLIENT_PORT} and joined multicast group ${multicastAddr}`)
    })

    socket.on('message', (msg, rinfo) => { this.onAnnounceMessage(msg, rinfo) })

    return socket
  }

  newUnicastAnnounceSocket (): Socket {
    let socket: Socket
    if (this.family === 'IPv4') {
      socket = createSocket({ type: 'udp4', reuseAddr: true })
    } else if (this.family === 'IPv6') {
      socket = createSocket({ type: 'udp6', reuseAddr: true })
    } else {
      throw new Error('unknown gateway address type')
    }

    socket.bind(CLIENT_PORT)

    socket.on('message', (msg, rinfo) => { this.onAnnounceMessage(msg, rinfo) })

    return socket
  }

  private onAnnounceMessage (msg: Buffer, rinfo: RemoteInfo): void {
    log('TODO onAnnounceMessage', msg, rinfo)
  }

  connect (): void {
    log('Client#connect()')
    if (this.connecting) return
    this.connecting = true
    this.clientSocket.bind(0) // use a random port as per spec
  }

  async * mapAll (internalPort: number, options: PCPMapPortOptions): AsyncGenerator<PortMapping, void, unknown> {
    let mapped = false

    for (const host of findLocalAddresses(this.family)) {
      try {
        log('mapping host', host)
        options.clientAddress = host
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

  // announce sends a PCP ANNOUNCE message to the gateway device.
  // This is used to determine:
  //   - if the gateway supports PCP
  //   - the gateway epoch
  async announce (): Promise<void> {
    log('Sending client PCP ANNOUNCE message')
    let success = false

    const addresses = findLocalAddresses(this.family)
    for (const address of addresses) {
      log('Announcing with address: ', address)
      const options: PCPMapPortOptions = {
        clientAddress: address,
        ttl: 0,
        autoRefresh: false
      }

      const deferred = defer<{ epoch: number }>()
      this.request(OP_ANNOUNCE, deferred, 0, options)

      try {
        const result = await raceSignal(deferred.promise, AbortSignal.timeout(3000))
        log(`PCP ANNOUNCE sent successfully using address: ${address}`)
        this.lastGoodIPAddress = address

        if (this.gatewayEpoch === undefined) {
          this.gatewayEpoch = Math.floor(Date.now() / 1000) - result.epoch
        } else {
          if (this.hasEpochChanged(result.epoch)) {
            // todo remap all ports
          }

          this.gatewayEpoch = result.epoch
        }

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

  async map (internalPort: number, internalHost: string, opts: PCPMapPortOptions): Promise<PortMapping> {
    const options = {
      clientAddress: internalHost,
      publicPort: opts?.suggestedExternalPort ?? internalPort,
      publicHost: opts?.suggestedExternalAddress ?? '',
      protocol: opts?.protocol ?? 'tcp',
      ttl: opts?.ttl ?? this.options.ttl ?? DEFAULT_PCP_PORT_MAPPING_TTL,
      autoRefresh: opts?.autoRefresh ?? this.options.autoRefresh ?? true,
      refreshTimeout: opts?.refreshTimeout ?? this.options.refreshTimeout ?? DEFAULT_REFRESH_TIMEOUT
    }

    log('Client#portMapping()')
    switch (options.protocol.toLowerCase()) {
      case 'tcp':
        break
      case 'udp':
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
      this.deleteMappingNonce(internalHost, internalPort, options.protocol)
      throw e
    }

    if (options.autoRefresh) {
      const refresh = ((internalPort: number, opts: PCPMapPortOptions): void => {
        log(`refreshing port mapping for ip: ${internalHost} port: ${internalPort} protocol: ${options.protocol}`)
        const mn = this.getMappingNonce(internalHost, internalPort, options.protocol)
        if (mn === undefined) {
          throw new Error('Could not find mapping to renew')
        }

        opts.suggestedExternalAddress = mn.externalHost
        opts.suggestedExternalPort = mn.externalPort
        this.map(internalPort, internalHost, {
          ...opts,
          signal: AbortSignal.timeout(options.refreshTimeout)
        })
          .catch(err => {
            log.error('could not refresh port mapping - %e', err)
          })
      }).bind(this, internalPort, {
        ...options,
        signal: undefined
      })

      this.refreshIntervals.set(internalPort, setTimeout(refresh, (result.lifetime / 2) * 1000))
    }

    return {
      externalHost: isPrivateIp(internalHost) === true ? await this.externalIp(opts) : internalHost,
      externalPort: result.externalPort,
      internalHost,
      internalPort: result.internalPort,
      protocol: result.protocol
    }
  }

  // unmap attempts to remove a mapping. However, if the internal host has sent
  // traffic recently (within the servers idle-timeout period), the mapping
  // isn’t immediately deleted. Instead, the mapping’s lifetime is set to the
  // remaining idle-timeout period.
  async unmap (localPort: number, opts: PCPMapPortOptions): Promise<void> {
    log('Client#portUnmapping()')

    await this.map(localPort, opts.clientAddress, {
      ...opts,
      ttl: 0
    })
  }

  // externalIP creates a short lived map to get the external IP as recommended
  // by the spec https://www.rfc-editor.org/rfc/rfc6887#section-11.6.
  // It should be OK for residential NATs but CGNATs may use a pool of
  // addresses so the external address isn't guaranteed.
  async externalIp (options?: AbortOptions): Promise<string> {
    for (const host of findLocalAddresses(this.family)) {
      const opts: PCPMapPortOptions = {
        clientAddress: host,
        ttl: MINIMUM_LIFETIME,
        autoRefresh: false
      }

      let externalIp: string | undefined

      try {
        // spec suggests using discard port (9) but there may be restrictions on
        // well-known (0-1023) ports, thus just use an ephemeral port
        // (49152-65535) instead.
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

  async stop (options?: AbortOptions): Promise<void> {
    log('Client#close()')

    this.queue = []
    this.connecting = false
    this.listening = false
    this.req = null
    this.reqActive = false

    // TODO
    // await Promise.all([...this.refreshIntervals.entries()].map(async ([port, timeout]) => {
    //   clearTimeout(timeout)
    //   const opts = {
    //     clientAddress: '', // TODO
    //     ...options
    //   }
    //   await this.unmap(port, opts)
    // }))

    // Cancel all refresh timeouts
    for (const timeout of this.refreshIntervals.values()) {
      clearTimeout(timeout)
    }
    this.refreshIntervals.clear()

    if (this.clientSocket != null) {
      this.clientSocket.close()
    }

    if (this.unicastAnnounceSocket != null) {
      this.unicastAnnounceSocket.close()
    }

    if (this.multicastAnnounceSocket != null) {
      this.multicastAnnounceSocket.close()
    }
  }

  private getEphemeralPort (): number {
    const min = 49152
    const max = 65535
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

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

  private newMappingNonce (internalHost: string, internalPort: number, protocol: Protocol): Mapping {
    return {
      protocol,
      internalHost,
      internalPort,
      nonce: randomBytes(12)
    }
  }

  private getMappingNonce (internalHost: string, internalPort: number, protocol: Protocol): Mapping | undefined {
    for (const mn of this.mappings) {
      if (
        mn.internalHost === internalHost &&
        mn.internalPort === internalPort &&
        mn.protocol.toLowerCase() === protocol.toLowerCase()
      ) {
        return mn
      }
    }

    return undefined
  }

  private getMappingFromNonce (nonce: Buffer): Mapping | undefined {
    for (const mn of this.mappings) {
      if (mn.nonce.equals(nonce)) {
        return mn
      }
    }

    return undefined
  }

  private getOrCreateMappingNonce (internalHost: string, internalPort: number, protocol: Protocol): Mapping {
    let mn = this.getMappingNonce(internalHost, internalPort, protocol)
    if (mn === undefined) {
      mn = this.newMappingNonce(internalHost, internalPort, protocol)
      this.mappings.push(mn)
    }

    return mn
  }

  private updateMappingNonce (internalPort: number, protocol: Protocol, nonce: Buffer, externalHost: string, externalPort: number, expiresAt: number): boolean {
    let updated = false

    for (let i = 0; i < this.mappings.length; i++) {
      if (this.mappings[i].internalPort === internalPort &&
        this.mappings[i].protocol.toString().toLowerCase() === protocol.toString().toLowerCase() &&
        (Buffer.compare(this.mappings[i].nonce, nonce) === 0)
      ) {
        this.mappings[i].externalHost = externalHost
        this.mappings[i].externalPort = externalPort
        this.mappings[i].expiresAt = expiresAt
        updated = true
      }
    }

    return updated
  }

  private deleteMappingNonce (internalHost: string, internalPort: number, protocol: Protocol): void {
    this.mappings = this.mappings.filter(mn => {
      return !(
        mn.internalHost === internalHost &&
        mn.internalPort === internalPort &&
        mn.protocol.toLowerCase() === protocol.toLowerCase()
      )
    })
  }

  public getMappings (): Mapping[] {
    return this.mappings
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

    const header = this.newPCPRequestHeader(obj.clientAddress, ttl, OP_MAP)

    header.copy(buf, pos, 0, 24)
    pos = 24

    // Mapping nonce
    const mappingNonce = this.getOrCreateMappingNonce(obj.clientAddress, localPort, obj.protocol)
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
      if (isIPv4(obj.clientAddress)) {
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
    return this.newPCPRequestHeader(obj.clientAddress, 0, OP_ANNOUNCE)
  }

  /**
   * Queues a UDP request to be sent to the gateway device.
   */
  request (op: typeof OP_ANNOUNCE | typeof OP_MAP, deferred: DeferredPromise<any>, localPort: number, obj: PCPMapPortOptions): void {
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
    this.queue.push({ op, buf, deferred })

    // Try to send next message
    this._next()
  }

  /**
   * Processes the next request if the clientSocket is listening.
   */
  _next (): void {
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

  onMessage (msg: Buffer, rinfo: RemoteInfo): void {
    log('Client#onMessage()', [msg, rinfo])

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
      cb(new Error(`"R" must be 1. Got: ${parsed.r}`)) // eslint-disable-line @typescript-eslint/restrict-template-expressions
      return
    }

    parsed.op = msg.readUint8(1) & 0x7F

    if (parsed.op !== req.op) {
      log('WARN: ignoring unexpected message opcode', parsed.op)
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

    parsed.resultCode = msg.readUInt8(3)
    if (!(parsed.resultCode in RESULT_CODES)) {
      cb(errCode(new Error('Unsupported result code'), parsed.resultCode))
      return
    }

    parsed.resultMessage = RESULT_CODES[parsed.resultCode]

    // Error
    if (parsed.resultCode !== RESULT_SUCCESS) {
      cb(errCode(new Error(parsed.resultMessage), parsed.resultCode))
      return
    }

    parsed.lifetime = msg.readUInt32BE(4)
    if (parsed.lifetime > 24 * 60 * 60) {
      // RFC6887 Section 15 https://www.rfc-editor.org/rfc/rfc6887#section-15
      // Set lifetime to 24 hours if larger
      log(`WARN: PCP server allocated a ${parsed.lifetime}s lifetime which is larger 24 hours, setting to 24 hours`)
      parsed.lifetime = 24 * 60 * 60
    }

    parsed.epoch = msg.readUInt32BE(8)

    // Success
    switch (req.op) {
      case OP_ANNOUNCE: {
        // OP_ANNOUNCE has no options to decode
        log('parsed', parsed)
        break
      }
      case OP_MAP: {
        this.processPCPMapResponse(msg, parsed, cb)
        break
      }
      default: {
        cb(new Error(`Unsupported opcode: ${req.op}`))
        return
      }
    }

    cb(undefined, parsed)
  }

  private processPCPMapResponse (msg: Buffer, parsed: any, cb: Callback): void {
    parsed.nonce = Buffer.alloc(12, 0)
    msg.copy(parsed.nonce, 0, 24, 36)
    if (this.getMappingFromNonce(parsed.nonce) === undefined) {
      cb(new Error('Nonce not found in mappings'))
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

    parsed.internalPort = msg.readUInt16BE(40)
    parsed.externalPort = msg.readUInt16BE(42)

    parsed.externalAddress = Buffer.alloc(16, 0)
    msg.copy(parsed.externalAddress, 0, 44, 60)

    const updated = this.updateMappingNonce(parsed.internalPort, parsed.protocol, parsed.nonce, parsed.externalAddress, parsed.externalPort, (Math.floor(Date.now() / 1000) + parsed.lifetime) * 1000)
    if (!updated) {
      cb(new Error(`Could not find mapping for ${parsed.internalPort}, ${parsed.type}, ${parsed.nonce.toString('hex')}`))
      return
    }

    log('parsed', parsed)
  }

  onListening (): void {
    log('Client#onListening()')
    this.listening = true
    this.connecting = false

    // Try to send next message
    this._next()
  }

  onClose (): void {
    log('Client#onClose()')
    this.listening = false
    this.connecting = false
  }

  onError (err: Error): void {
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
}
