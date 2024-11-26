import { setMaxListeners } from 'node:events'
import { logger } from '@libp2p/logger'
import { fetchXML } from './fetch.js'
import type { Service } from '@achingbrain/ssdp'
import type { AbortOptions } from 'abort-error'

const log = logger('nat-port-mapper:upnp:device')

export interface InternetGatewayDevice {
  device: GatewayDevice
}

interface GatewayDevice {
  deviceType: string
  serviceList: {
    service: GatewayService[]
  }
  deviceList: {
    device: GatewayDevice[]
  }
}

interface GatewayService {
  serviceType: string
  serviceId: string
  SCPDURL: string
  controlURL: string
  eventSubURL: string
}

interface ServiceDescription {
  services: GatewayService[]
  devices: GatewayDevice[]
}

interface ServiceInfo {
  service: string
  SCPDURL: string
  controlURL: string
}

export class Device {
  public readonly service: Service<InternetGatewayDevice>
  private readonly services: string[]
  private readonly shutdownController: AbortController

  constructor (service: Service<InternetGatewayDevice>) {
    this.service = service
    this.services = [
      'urn:schemas-upnp-org:service:WANIPConnection:1',
      'urn:schemas-upnp-org:service:WANIPConnection:2',
      'urn:schemas-upnp-org:service:WANPPPConnection:1'
    ]

    // used to terminate network operations on shutdown
    this.shutdownController = new AbortController()
    setMaxListeners(Infinity, this.shutdownController.signal)
  }

  async run (action: string, args: Array<[string, string | number]>, options?: AbortOptions): Promise<any> {
    const info = this.getService(this.services)

    const requestBody = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${info.service}">${args.map((args) => `
      <${args[0]}>${args[1] ?? ''}</${args[0]}>`).join('')}
    </u:${action}>
  </s:Body>
</s:Envelope>`

    log.trace('-> POST', info.controlURL)
    log.trace('->', requestBody)

    const responseBody = await fetchXML(new URL(info.controlURL), {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': requestBody.length.toString(),
        SOAPAction: JSON.stringify(info.service + '#' + action)
      },
      body: requestBody
    })

    const soapns = this.getNamespace(
      responseBody,
      'http://schemas.xmlsoap.org/soap/envelope/'
    )

    return responseBody[soapns + 'Body']
  }

  getService (types: string[]): ServiceInfo {
    const [service] = this.parseDescription(this.service.details).services
      .filter(function (service) {
        return types.includes(service.serviceType)
      })

    // Use the first available service
    if (service?.controlURL == null || service.SCPDURL == null) {
      throw new Error('Service not found')
    }

    const base = new URL(this.service.location)
    function addPrefix (u: string): string {
      let uri: URL
      try {
        uri = new URL(u)
      } catch (err) {
        // Is only the path of the URL
        uri = new URL(u, base.href)
      }

      uri.host = uri.host ?? base.host
      uri.protocol = uri.protocol ?? base.protocol

      return uri.toString()
    }

    return {
      service: service.serviceType,
      SCPDURL: addPrefix(service.SCPDURL),
      controlURL: addPrefix(service.controlURL)
    }
  }

  parseDescription (info: Record<string, any>): ServiceDescription {
    const services: GatewayService[] = []
    const devices: GatewayDevice[] = []

    function toArray <T> (item: T | T[]): T[] {
      return Array.isArray(item) ? item : [item]
    }

    function traverseServices (service: GatewayService): void {
      if (service == null) {
        return
      }

      services.push(service)
    }

    function traverseDevices (device: GatewayDevice): void {
      if (device == null) {
        return
      }

      devices.push(device)

      if (device.deviceList?.device != null) {
        toArray(device.deviceList.device).forEach(traverseDevices)
      }

      if (device.serviceList?.service != null) {
        toArray(device.serviceList.service).forEach(traverseServices)
      }
    }

    traverseDevices(info.device)

    return {
      services,
      devices
    }
  }

  getNamespace (data: any, uri: string): string {
    let ns: string | undefined

    if (data['@'] != null) {
      Object.keys(data['@']).some(function (key) {
        if (!/^xmlns:/.test(key)) return false
        if (data['@'][key] !== uri) return false

        ns = key.replace(/^xmlns:/, '')
        return true
      })
    }

    return ns != null ? `${ns}:` : ''
  }

  close (): void {
    this.shutdownController.abort()
  }
}
