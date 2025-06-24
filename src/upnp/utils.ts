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
