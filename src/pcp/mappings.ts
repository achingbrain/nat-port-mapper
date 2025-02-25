import { randomBytes } from 'crypto'
import type { Protocol } from '../index.js'

export interface Mapping {
  protocol: Protocol
  internalHost: string
  internalPort: number
  externalHost?: string
  externalPort?: number
  nonce: Buffer
  expiresAt?: number
}

export class Mappings {
  private mappings: Mapping[]

  constructor () {
    this.mappings = []
  }

  private new (internalHost: string, internalPort: number, protocol: Protocol): Mapping {
    const m: Mapping = {
      protocol,
      internalHost,
      internalPort,
      nonce: randomBytes(12)
    }

    return m
  }

  public get (internalHost: string, internalPort: number, protocol: Protocol): Mapping | undefined {
    for (const m of this.mappings) {
      if (
        m.internalHost === internalHost &&
        m.internalPort === internalPort &&
        m.protocol.toLowerCase() === protocol.toLowerCase()
      ) {
        return m
      }
    }

    return undefined
  }

  public getAll (): Mapping[] {
    return this.mappings
  }

  public getByNonce (nonce: Buffer): Mapping | undefined {
    for (const m of this.mappings) {
      if (m.nonce.equals(nonce)) {
        return m
      }
    }

    return undefined
  }

  public getOrCreate (internalHost: string, internalPort: number, protocol: Protocol): Mapping {
    let m = this.get(internalHost, internalPort, protocol)

    if (m === undefined) {
      m = this.new(internalHost, internalPort, protocol)
      this.mappings.push(m)
    }

    return m
  }

  public update (internalPort: number, protocol: Protocol, nonce: Buffer, externalHost: string, externalPort: number, expiresAt: number): boolean {
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

  public delete (internalHost: string, internalPort: number, protocol: Protocol): void {
    this.mappings = this.mappings.filter(mn => {
      return !(
        mn.internalHost === internalHost &&
        mn.internalPort === internalPort &&
        mn.protocol.toLowerCase() === protocol.toLowerCase()
      )
    })
  }

  public deleteAll (): void {
    this.mappings.length = 0
  }
}
