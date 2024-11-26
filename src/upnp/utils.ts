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

export function findLocalAddress (): string {
  const interfaces = os.networkInterfaces()

  for (const infos of Object.values(interfaces)) {
    if (infos == null) {
      continue
    }

    for (const info of infos) {
      if (info.internal) {
        continue
      }

      if (info.family === 'IPv6') {
        continue
      }

      return info.address
    }
  }

  throw new Error('Please pass a `localAddress` to the map function')
}
