import os from 'node:os'

export function findNamespacedKey (key: string, data: any): string {
  let ns = null
  Object.keys(data).some((k) => {
    if (new RegExp(`!/:${key}$/`).test(k)) {
      return false
    }

    ns = k
    return true
  })

  if (ns == null) {
    throw new Error('Incorrect response')
  }

  return ns
}

export function * findLocalAddresses (family: 'IPv4' | 'IPv6'): Generator<string, void, unknown> {
  const interfaces = os.networkInterfaces()
  let foundAddress = false

  for (const infos of Object.values(interfaces)) {
    if (infos == null) {
      continue
    }

    for (const info of infos) {
      if (info.internal) {
        // ignore loopback
        continue
      }

      if (info.family !== family) {
        continue
      }

      if (info.family === 'IPv6' && info.address.startsWith('fe80')) {
        // ignore IPv6 link-local unicast
        continue
      }

      if (info.family === 'IPv4' && info.address.startsWith('169.254')) {
        // ignore IPv4 link-local unicast
        continue
      }

      foundAddress = true
      yield info.address
    }
  }

  if (!foundAddress) {
    throw new Error('Could not detect any local addresses eligible for mapping - please pass a `localAddress` to the map function instead')
  }
}

export function getNamespace (data: any, uri: string): string {
  let ns: string | undefined

  if (data['@'] != null) {
    Object.keys(data['@']).some(function (key) {
      if (!/^xmlns:/.test(key)) { return false }
      if (data['@'][key] !== uri) { return false }

      ns = key.replace(/^xmlns:/, '')
      return true
    })
  }

  return ns != null ? `${ns}:` : ''
}

export function stripHostBrackets (host: string): string {
  if (host.startsWith('[')) {
    host = host.substring(1)
  }

  if (host.endsWith(']')) {
    host = host.substring(0, host.length - 1)
  }

  return host
}
