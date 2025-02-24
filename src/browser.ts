import type { UPnPNAT, PMPNAT, PCPNAT } from './index.js'

export async function upnpNat (): Promise<UPnPNAT> {
  throw new Error('Not supported in browsers')
}

export async function pmpNat (): Promise<PMPNAT> {
  throw new Error('Not supported in browsers')
}

export async function pcpNat (): Promise<PCPNAT> {
  throw new Error('Not supported in browsers')
}
