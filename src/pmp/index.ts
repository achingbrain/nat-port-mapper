import { EventEmitter } from 'events'
import { PMPGateway } from './gateway.js'
import type { Gateway, GlobalMapPortOptions } from '../index.js'

export class PMPClient extends EventEmitter {
  private readonly options: GlobalMapPortOptions

  constructor (options: GlobalMapPortOptions = {}) {
    super()

    this.options = options
  }

  getGateway (ipAddress: string): Gateway {
    return new PMPGateway(ipAddress, this.options)
  }
}
