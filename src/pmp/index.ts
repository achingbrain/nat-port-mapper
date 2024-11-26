import { EventEmitter } from 'events'
import { logger } from '@libp2p/logger'
import { PMPGateway } from './gateway.js'
import type { Gateway, NatAPIOptions } from '../index.js'
import type { AbortOptions } from 'abort-error'

const log = logger('nat-port-mapper:pmp')

export class PMPClient extends EventEmitter {
  static createClient (gateway: string, options?: NatAPIOptions): PMPClient {
    return new PMPClient(gateway, options)
  }

  private readonly gateway: string
  private readonly options: NatAPIOptions

  constructor (gateway: string, options: NatAPIOptions = {}) {
    super()

    this.gateway = gateway
    this.options = options
  }

  async * findGateways (options?: AbortOptions): AsyncGenerator<Gateway, void, unknown> {
    log('find uPnP gateways')

    yield new PMPGateway(this.gateway, this.options)
  }
}
