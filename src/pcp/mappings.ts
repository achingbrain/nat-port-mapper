import { randomBytes } from 'crypto'
import type { Protocol } from '../index.js'

export interface Mapping {
  protocol: Protocol
  internalHost: string
  internalPort: number
  externalHost?: string
  externalPort?: number
  nonce: Buffer
  autoRefresh?: boolean
  expiresAt?: number
  lifetime?: number // number of seconds this mapping will be active on the PCP server
}

export class Mappings {
  private mappings: Mapping[]

  constructor () {
    this.mappings = []
  }

  private new (internalHost: string, internalPort: number, protocol: Protocol, autoRefresh?: boolean): Mapping {
    const m: Mapping = {
      protocol,
      internalHost,
      internalPort,
      nonce: randomBytes(12),
      autoRefresh
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

  public getOrCreate (internalHost: string, internalPort: number, protocol: Protocol, autoRefresh?: boolean): Mapping {
    let m = this.get(internalHost, internalPort, protocol)

    if (m === undefined) {
      m = this.new(internalHost, internalPort, protocol, autoRefresh)
      this.mappings.push(m)
    }

    return m
  }

  public getExpiring (): Mapping[] {
    const now = Date.now()

    return this.mappings.filter(mapping => {
      if (mapping.autoRefresh === undefined || !mapping.autoRefresh) return false
      if (mapping.expiresAt === undefined || mapping.lifetime === undefined) return false

      // If less than 1/2 the lifetime is remaining, class as expiring
      // https://www.rfc-editor.org/rfc/rfc6887#section-11.2.1
      const remainingTime = (mapping.expiresAt - now) / 1000

      return remainingTime < (mapping.lifetime / 2)
    })
  }

  public update (internalPort: number, protocol: Protocol, nonce: Buffer, externalHost: string, externalPort: number, expiresAt: number, lifetime: number): boolean {
    let updated = false

    for (let i = 0; i < this.mappings.length; i++) {
      if (this.mappings[i].internalPort === internalPort &&
        this.mappings[i].protocol.toString().toLowerCase() === protocol.toString().toLowerCase() &&
        (Buffer.compare(this.mappings[i].nonce, nonce) === 0)
      ) {
        this.mappings[i].externalHost = externalHost
        this.mappings[i].externalPort = externalPort
        this.mappings[i].expiresAt = expiresAt
        this.mappings[i].lifetime = lifetime
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
