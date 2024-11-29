import { logger } from '@libp2p/logger'
import xml2js from 'xml2js'
import { NS_SOAP } from './constants.js'
import { getNamespace } from './utils.js'

const log = logger('nat-port-mapper:upnp:fetch')

export interface RequestInit {
  method?: 'POST' | 'GET'
  headers?: Record<string, string>
  body?: Buffer | string
  signal?: AbortSignal
}

export async function fetchXML <Response = any> (url: URL, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init)

  log.trace('-> %s %s', init.method ?? 'GET', url, response.status)

  if (init.body != null) {
    log.trace('->', init.body)
  }

  const contentType = response.headers.get('content-type')

  if (contentType?.includes('/xml') !== true) {
    throw new Error(`Bad content type: ${contentType}`)
  }

  const responseText = await response.text()

  log.trace('<-', responseText)

  const parser = new xml2js.Parser({
    explicitRoot: false,
    explicitArray: false,
    attrkey: '@'
  })

  const responseBody = await parser.parseStringPromise(responseText)

  if (!response.ok) {
    const soapns = getNamespace(responseBody, NS_SOAP)
    const body = responseBody[`${soapns}Body`]
    const fault = body[`${soapns}Fault`]
    const error = fault?.detail?.UPnPError ?? {
      errorCode: -1,
      errorDescription: 'Unknown error'
    }

    if (fault?.detail?.UPnPError != null) {
      throw new UPnPError(`Code ${error.errorCode} - ${error.errorDescription}`)
    }

    throw new Error(`Request failed: ${response.statusText}`)
  }

  return responseBody
}

class UPnPError extends Error {
  static name = 'UPnPError'
  name = 'UPnPError'
}
