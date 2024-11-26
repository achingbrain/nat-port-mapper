import type { UPnPNAT, PMPNAT } from './index.js'

export async function upnpNat (): Promise<UPnPNAT> {
  throw new Error('Not supported in browsers')
}

export async function pmpNat (): Promise<PMPNAT> {
  throw new Error('Not supported in browsers')
}
