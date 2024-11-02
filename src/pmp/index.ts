import { createSocket } from 'dgram'
import { EventEmitter } from 'events'
import { logger } from '@libp2p/logger'
import errCode from 'err-code'
import defer, { type DeferredPromise } from 'p-defer'
import { raceSignal } from 'race-signal'
import type { DiscoverGateway } from '../discovery/index.js'
import type { Client, InternalMapOptions } from '../types.js'
import type { AbortOptions } from 'abort-error'
import type { Socket, RemoteInfo } from 'dgram'

const log = logger('nat-port-mapper:pmp')

// Ports defined by draft
const CLIENT_PORT = 5350
const SERVER_PORT = 5351

// Opcodes
const OP_EXTERNAL_IP = 0
const OP_MAP_UDP = 1
const OP_MAP_TCP = 2
const SERVER_DELTA = 128

// Result codes
const RESULT_CODES: Record<number, string> = {
  0: 'Success',
  1: 'Unsupported Version',
  2: 'Not Authorized/Refused (gateway may have NAT-PMP disabled)',
  3: 'Network Failure (gateway may have not obtained a DHCP lease)',
  4: 'Out of Resources (no ports left)',
  5: 'Unsupported opcode'
}

export interface PortMappingOptions {
  type?: 'tcp' | 'udp'
  ttl?: number
  public?: number
  private?: number
  internal?: number
  external?: number
}

export class PMPClient extends EventEmitter implements Client {
  private readonly socket: Socket
  private queue: Array<{ op: number, buf: Uint8Array, deferred: DeferredPromise<any> }>
  private connecting: boolean
  private listening: boolean
  private req: any
  private reqActive: boolean
  private readonly discoverGateway: () => DiscoverGateway
  private gateway?: string
  private cancelGatewayDiscovery?: (options?: AbortOptions) => Promise<void>

  static createClient (discoverGateway: () => DiscoverGateway): PMPClient {
    return new PMPClient(discoverGateway)
  }

  constructor (discoverGateway: () => DiscoverGateway) {
    super()

    if (discoverGateway == null) {
      throw new Error('discoverGateway is not defined')
    }

    this.discoverGateway = discoverGateway
    this.queue = []
    this.connecting = false
    this.listening = false
    this.req = null
    this.reqActive = false

    // Create socket
    this.socket = createSocket({ type: 'udp4', reuseAddr: true })
    this.socket.on('listening', () => { this.onListening() })
    this.socket.on('message', (msg, rinfo) => { this.onMessage(msg, rinfo) })
    this.socket.on('close', () => { this.onClose() })
    this.socket.on('error', (err) => { this.onError(err) })

    // Try to connect
    this.connect()
  }

  connect (): void {
    log('Client#connect()')
    if (this.connecting) return
    this.connecting = true
    this.socket.bind(CLIENT_PORT)
  }

  async map (localPort: number, opts: InternalMapOptions): Promise<void> {
    log('Client#portMapping()')
    let opcode: typeof OP_MAP_TCP | typeof OP_MAP_UDP
    switch (String(opts.protocol ?? 'tcp').toLowerCase()) {
      case 'tcp':
        opcode = OP_MAP_TCP
        break
      case 'udp':
        opcode = OP_MAP_UDP
        break
      default:
        throw new Error('"type" must be either "tcp" or "udp"')
    }

    const discoverGateway = this.discoverGateway()
    this.cancelGatewayDiscovery = discoverGateway.cancel

    const gateway = await discoverGateway.gateway(opts)
    this.cancelGatewayDiscovery = undefined

    this.gateway = new URL(gateway.location).host

    const deferred = defer()

    this.request(opcode, deferred, localPort, opts)

    await raceSignal(deferred.promise, opts.signal)
  }

  async unmap (localPort: number, opts: InternalMapOptions): Promise<void> {
    log('Client#portUnmapping()')

    await this.map(localPort, {
      ...opts,
      description: '',
      localAddress: '',
      ttl: 0
    })
  }

  async externalIp (options?: AbortOptions): Promise<string> {
    log('Client#externalIp()')

    const discoverGateway = this.discoverGateway()
    this.cancelGatewayDiscovery = discoverGateway.cancel

    const gateway = await discoverGateway.gateway(options)
    this.cancelGatewayDiscovery = undefined

    this.gateway = new URL(gateway.location).host

    const deferred = defer<string>()

    this.request(OP_EXTERNAL_IP, deferred)

    return deferred.promise
  }

  async close (options?: AbortOptions): Promise<void> {
    log('Client#close()')

    if (this.socket != null) {
      this.socket.close()
    }

    this.queue = []
    this.connecting = false
    this.listening = false
    this.req = null
    this.reqActive = false

    if (this.cancelGatewayDiscovery != null) {
      await this.cancelGatewayDiscovery(options)
    }
  }

  /**
   * Queues a UDP request to be send to the gateway device.
   */

  request (op: typeof OP_EXTERNAL_IP, deferred: DeferredPromise<any>): void
  request (op: typeof OP_MAP_TCP | typeof OP_MAP_UDP, deferred: DeferredPromise<any>, localPort: number, obj: InternalMapOptions): void
  request (op: number, deferred: DeferredPromise<any>, localPort?: any, obj?: InternalMapOptions): void {
    log('Client#request()', [op, obj])

    let buf
    let size
    let pos = 0
    let ttl

    switch (op) {
      case OP_MAP_UDP:
      case OP_MAP_TCP:
        if (obj == null) {
          throw new Error('mapping a port requires an "options" object')
        }

        ttl = Number(obj.ttl ?? 0)
        if (ttl !== (ttl | 0)) {
          // The RECOMMENDED Port Mapping Lifetime is 7200 seconds (two hours)
          ttl = 7200
        }

        size = 12
        buf = Buffer.alloc(size)
        buf.writeUInt8(0, pos)
        pos++ // Vers = 0
        buf.writeUInt8(op, pos)
        pos++ // OP = x
        buf.writeUInt16BE(0, pos)
        pos += 2 // Reserved (MUST be zero)
        buf.writeUInt16BE(localPort, pos)
        pos += 2 // Internal Port
        buf.writeUInt16BE(obj.publicPort, pos)
        pos += 2 // Requested External Port
        buf.writeUInt32BE(ttl, pos)
        pos += 4 // Requested Port Mapping Lifetime in Seconds
        break
      case OP_EXTERNAL_IP:
        size = 2
        buf = Buffer.alloc(size)
        // Vers = 0
        buf.writeUInt8(0, 0)
        pos++
        // OP = x
        buf.writeUInt8(op, 1)
        pos++
        break
      default:
        throw new Error(`Invalid opcode: ${op}`)
    }
    // assert.equal(pos, size, 'buffer not fully written!')

    // Add it to queue
    this.queue.push({ op, buf, deferred })

    // Try to send next message
    this._next()
  }

  /**
   * Processes the next request if the socket is listening.
   */
  _next (): void {
    log('Client#_next()')

    const req = this.queue[0]

    if (req == null) {
      log('_next: nothing to process')
      return
    }

    if (this.socket == null) {
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

    log('_next: sending request', buf, this.gateway)
    this.socket.send(buf, 0, buf.length, SERVER_PORT, this.gateway)
  }

  onListening (): void {
    log('Client#onListening()')
    this.listening = true
    this.connecting = false

    // Try to send next message
    this._next()
  }

  onMessage (msg: Buffer, rinfo: RemoteInfo): void {
    // Ignore message if we're not expecting it
    if (this.queue.length === 0) {
      return
    }

    log('Client#onMessage()', [msg, rinfo])

    const cb = (err?: Error, parsed?: any): void => {
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
    parsed.vers = msg.readUInt8(0)
    parsed.op = msg.readUInt8(1)

    if (parsed.op - SERVER_DELTA !== req.op) {
      log('WARN: ignoring unexpected message opcode', parsed.op)
      return
    }

    // if we got here, then we're gonna invoke the request's callback,
    // so shift this request off of the queue.
    log('removing "req" off of the queue')
    this.queue.shift()

    if (parsed.vers !== 0) {
      cb(new Error(`"vers" must be 0. Got: ${parsed.vers}`)) // eslint-disable-line @typescript-eslint/restrict-template-expressions
      return
    }

    // Common fields
    parsed.resultCode = msg.readUInt16BE(2)
    parsed.resultMessage = RESULT_CODES[parsed.resultCode]
    parsed.epoch = msg.readUInt32BE(4)

    // Error
    if (parsed.resultCode !== 0) {
      cb(errCode(new Error(parsed.resultMessage), parsed.resultCode)); return
    }

    // Success
    switch (req.op) {
      case OP_MAP_UDP:
      case OP_MAP_TCP:
        parsed.private = parsed.internal = msg.readUInt16BE(8)
        parsed.public = parsed.external = msg.readUInt16BE(10)
        parsed.ttl = msg.readUInt32BE(12)
        parsed.type = (req.op === OP_MAP_UDP) ? 'udp' : 'tcp'
        break
      case OP_EXTERNAL_IP:
        parsed.ip = []
        parsed.ip.push(msg.readUInt8(8))
        parsed.ip.push(msg.readUInt8(9))
        parsed.ip.push(msg.readUInt8(10))
        parsed.ip.push(msg.readUInt8(11))
        break
      default:
      { cb(new Error(`Unknown opcode: ${req.op}`)); return }
    }

    cb(undefined, parsed)
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

    if (this.socket != null) {
      this.socket.close()
      // Force close - close() does not guarantee to trigger onClose()
      this.onClose()
    }
  }
}
