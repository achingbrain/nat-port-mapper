import http from 'http'
import https from 'https'
import { logger } from '@libp2p/logger'
import xml2js from 'xml2js'

const log = logger('nat-port-mapper:upnp:fetch')

export interface RequestInit {
  method?: 'POST' | 'GET'
  headers?: Record<string, string>
  body?: Buffer | string
  signal?: AbortSignal
}

function initRequest (url: URL, init: RequestInit): http.ClientRequest {
  if (url.protocol === 'http:') {
    return http.request(url, {
      method: init.method,
      headers: init.headers,
      signal: init.signal
    })
  } else if (url.protocol === 'https:') {
    return https.request(url, {
      method: init.method,
      headers: init.headers,
      rejectUnauthorized: false,
      signal: init.signal
    })
  } else {
    throw new Error('Invalid protocol ' + url.protocol)
  }
}

export async function fetchXML <Response = any> (url: URL, init: RequestInit): Promise<Response> {
  log.trace('-> %s %s', init.method ?? 'GET', url)

  if (init.body != null) {
    log.trace('->', init.body)
  }

  const responseText = await new Promise<string>((resolve, reject) => {
    const request = initRequest(url, init)

    if (init.body != null) {
      request.write(init.body)
    }

    request.end()

    request.on('error', (err) => {
      reject(err)
    })

    request.on('response', (response) => {
      if (response.statusCode === 302 && response.headers.location != null) {
        log('redirecting to %s', response.headers.location)
        fetchXML(new URL(response.headers.location), init)
          .then(resolve, reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Request failed: ${response.statusCode}`)) // eslint-disable-line @typescript-eslint/restrict-template-expressions
        return
      }

      if (response.headers['content-type'] != null && !response.headers['content-type'].includes('/xml')) {
        reject(new Error('Bad content type ' + response.headers['content-type']))
        return
      }

      let body = ''

      response.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })
      response.on('end', () => {
        resolve(body)
      })
      response.on('error', (err) => {
        reject(err)
      })
    })
  })

  const parser = new xml2js.Parser({
    explicitRoot: false,
    explicitArray: false,
    attrkey: '@'
  })

  log.trace('<-', responseText)

  return parser.parseStringPromise(responseText)
}
