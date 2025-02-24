import { EventEmitter } from 'events'
import { PCPGateway } from './gateway.js'
import type { Gateway, GlobalMapPortOptions } from '../index.js'
import type { AbortOptions } from 'abort-error'

export class PCPNATClient extends EventEmitter {
  private readonly options: GlobalMapPortOptions
  private readonly gatewayIP: string

  constructor (gatewayIP: string, options: GlobalMapPortOptions = {}) {
    super()

    this.gatewayIP = gatewayIP
    this.options = options
  }

  async getGateway (options?: AbortOptions): Promise<Gateway> {
    const gateway = new PCPGateway(this.gatewayIP, this.options)

    await gateway.isPCPSupported()

    return gateway
  }
}
