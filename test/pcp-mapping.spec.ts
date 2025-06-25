import { randomBytes } from 'crypto'
import { expect } from 'chai'
import { Mappings } from '../src/pcp/mappings.js'
import type { Protocol } from '../src/index.js'

describe('pcp-mapping', () => {
  let mappings: Mappings

  beforeEach(() => {
    mappings = new Mappings()
  })

  describe('getOrCreate & get', () => {
    it('should create a new mapping when none exists', () => {
      const protocol: Protocol = 'TCP'
      const internalHost = '127.0.0.1'
      const internalPort = 8080
      const mapping = mappings.getOrCreate(internalHost, internalPort, protocol)

      expect(mapping).to.not.eq(undefined)
      expect(mapping.internalHost).to.equal(internalHost)
      expect(mapping.internalPort).to.equal(internalPort)
      // protocol comparison is case-insensitive
      expect(mapping.protocol.toLowerCase()).to.equal(protocol.toLowerCase())
    })

    it('should return the same mapping when getOrCreate is called with the same parameters', () => {
      const protocol: Protocol = 'UDP'
      const internalHost = '127.0.0.1'
      const internalPort = 3000

      const mapping1 = mappings.getOrCreate(internalHost, internalPort, protocol)
      const mapping2 = mappings.getOrCreate(internalHost, internalPort, protocol)

      expect(mapping1).to.equal(mapping2)
    })

    it('should retrieve a mapping regardless of protocol case', () => {
      const protocol: Protocol = 'TCP'
      const internalHost = '192.168.1.1'
      const internalPort = 80

      const mapping = mappings.getOrCreate(internalHost, internalPort, protocol)
      // Retrieve with different case
      const retrieved = mappings.get(internalHost, internalPort, protocol.toLowerCase() as Protocol)
      expect(retrieved).to.equal(mapping)
    })

    it('should return undefined when trying to get a non-existent mapping', () => {
      const result = mappings.get('10.0.0.1', 9999, 'TCP')
      expect(result).to.eq(undefined)
    })

    it('should create a mapping with autoRefresh flag when provided', () => {
      const protocol: Protocol = 'TCP'
      const internalHost = '10.0.0.1'
      const internalPort = 5555
      const mapping = mappings.getOrCreate(internalHost, internalPort, protocol, true)
      expect(mapping.autoRefresh).to.equal(true)
    })
  })

  describe('getByNonce', () => {
    it('should return the mapping matching the given nonce', () => {
      const protocol: Protocol = 'TCP'
      const internalHost = '10.0.0.1'
      const internalPort = 25

      const mapping = mappings.getOrCreate(internalHost, internalPort, protocol)
      const found = mappings.getByNonce(mapping.nonce)

      expect(found).to.equal(mapping)
    })

    it('should return undefined for a random nonce that does not exist', () => {
      const protocol: Protocol = 'TCP'
      const internalHost = '10.0.0.1'
      const internalPort = 21

      // Create a mapping so the mappings array isn’t empty.
      mappings.getOrCreate(internalHost, internalPort, protocol)
      const randomNonce = randomBytes(12)
      const found = mappings.getByNonce(randomNonce)
      expect(found).to.eq(undefined)
    })
  })

  describe('update', () => {
    it('should update a mapping when internalPort, protocol, and nonce match', () => {
      const protocol: Protocol = 'TCP'
      const internalHost = '10.0.0.1'
      const internalPort = 5000

      const mapping = mappings.getOrCreate(internalHost, internalPort, protocol)
      const newExternalHost = '192.168.1.1'
      const newExternalPort = 6000
      const expiresAt = Date.now() + 10000
      const lifetime = 1234

      const updated = mappings.update(internalPort, protocol, mapping.nonce, newExternalHost, newExternalPort, expiresAt, lifetime)
      expect(updated).to.equal(true)

      const updatedMapping = mappings.get(internalHost, internalPort, protocol)
      expect(updatedMapping).to.not.eq(undefined)
      if (updatedMapping !== undefined) {
        expect(updatedMapping.externalHost).to.equal(newExternalHost)
        expect(updatedMapping.externalPort).to.equal(newExternalPort)
        expect(updatedMapping.expiresAt).to.equal(expiresAt)
        expect(updatedMapping.lifetime).to.equal(lifetime)
      }
    })

    it('should not update a mapping if the nonce does not match', () => {
      const protocol: Protocol = 'UDP'
      const internalHost = '10.0.0.2'
      const internalPort = 7000

      mappings.getOrCreate(internalHost, internalPort, protocol)
      const newExternalHost = '192.168.1.1'
      const newExternalPort = 8000
      const expiresAt = Date.now() + 20000
      const lifetime = 1234

      // Generate a wrong nonce
      const wrongNonce = randomBytes(12)
      const updated = mappings.update(internalPort, protocol, wrongNonce, newExternalHost, newExternalPort, expiresAt, lifetime)
      expect(updated).to.equal(false)

      // The mapping should remain unchanged
      const mapping = mappings.get(internalHost, internalPort, protocol)
      expect(mapping).to.not.eq(undefined)
      if (mapping !== undefined) {
        expect(mapping.externalHost).to.eq(undefined)
        expect(mapping.externalPort).to.eq(undefined)
        expect(mapping.expiresAt).to.eq(undefined)
        expect(mapping.lifetime).to.eq(undefined)
      }
    })

    it('should update mapping regardless of protocol case', () => {
      const protocol: Protocol = 'tcp'
      const internalHost = '192.168.0.1'
      const internalPort = 8081

      const mapping = mappings.getOrCreate(internalHost, internalPort, protocol)
      const newExternalHost = '10.0.0.1'
      const newExternalPort = 9090
      const expiresAt = Date.now() + 5000
      const lifetime = 1234

      // Update using a different case for the protocol
      const updated = mappings.update(internalPort, protocol.toUpperCase() as Protocol, mapping.nonce, newExternalHost, newExternalPort, expiresAt, lifetime)
      expect(updated).to.equal(true)

      const updatedMapping = mappings.get(internalHost, internalPort, protocol)
      expect(updatedMapping).to.not.eq(undefined)
      if (updatedMapping !== undefined) {
        expect(updatedMapping.externalHost).to.equal(newExternalHost)
        expect(updatedMapping.externalPort).to.equal(newExternalPort)
        expect(updatedMapping.expiresAt).to.equal(expiresAt)
        expect(updatedMapping.lifetime).to.equal(lifetime)
      }
    })
  })

  describe('delete', () => {
    it('should delete the mapping that matches the provided criteria', () => {
      const protocol: Protocol = 'TCP'
      const internalHost = '10.0.0.1'
      const internalPort = 1234

      mappings.getOrCreate(internalHost, internalPort, protocol)
      expect(mappings.get(internalHost, internalPort, protocol)).to.not.eq(undefined)

      mappings.delete(internalHost, internalPort, protocol)
      expect(mappings.get(internalHost, internalPort, protocol)).to.eq(undefined)
    })

    it('should not delete other mappings when deleting one', () => {
      const host1 = '10.0.0.1'
      const host2 = '10.0.0.2'

      mappings.getOrCreate(host1, 1111, 'TCP')
      const mapping2 = mappings.getOrCreate(host2, 2222, 'TCP')

      mappings.delete(host1, 1111, 'TCP')
      expect(mappings.get(host1, 1111, 'TCP')).to.eq(undefined)
      expect(mappings.get(host2, 2222, 'TCP')).to.equal(mapping2)
    })
  })

  describe('deleteAll', () => {
    it('should remove all mappings', () => {
      mappings.getOrCreate('10.0.0.1', 1111, 'TCP')
      mappings.getOrCreate('10.0.0.2', 2222, 'UDP')

      expect(mappings.getAll().length).to.be.greaterThan(0)

      mappings.deleteAll()
      expect(mappings.getAll()).to.have.lengthOf(0)
    })
  })

  describe('getExpiring', () => {
    it('should return an empty array if no mapping has autoRefresh true', () => {
      mappings.getOrCreate('10.0.0.1', 1111, 'TCP', false)
      const expiring = mappings.getExpiring()
      expect(expiring.length).to.equal(0)
    })

    it('should return an empty array if an autoRefresh mapping is missing expiresAt or lifetime', () => {
      // Create a mapping with autoRefresh true, but without setting expiresAt and lifetime
      mappings.getOrCreate('10.0.0.1', 2222, 'TCP', true)
      const expiring = mappings.getExpiring()
      expect(expiring.length).to.equal(0)
    })

    it('should return mapping when remaining time is less than half the lifetime', () => {
      const internalHost = '10.0.0.1'
      const internalPort = 3333
      const protocol: Protocol = 'UDP'
      const mapping = mappings.getOrCreate(internalHost, internalPort, protocol, true)
      const lifetime = 100 // seconds
      const now = Date.now()
      // Set expiresAt so that remaining time (in seconds) is less than half of lifetime (i.e. <50 seconds)
      mapping.expiresAt = now + 30 * 1000 // expires in 30 seconds
      mapping.lifetime = lifetime

      const expiring = mappings.getExpiring()
      expect(expiring).to.have.lengthOf(1)
      expect(expiring[0]).to.equal(mapping)
    })

    it('should return mapping an empty array  when remaining time is greater than or equal to half the lifetime', () => {
      const internalHost = '10.0.0.1'
      const internalPort = 4444
      const protocol: Protocol = 'TCP'
      const mapping = mappings.getOrCreate(internalHost, internalPort, protocol, true)
      const lifetime = 100 // seconds
      const now = Date.now()
      // Set expiresAt so that remaining time is more than half the lifetime (>=50 seconds)
      mapping.expiresAt = now + 80 * 1000 // expires in 80 seconds
      mapping.lifetime = lifetime

      const expiring = mappings.getExpiring()
      expect(expiring).to.have.lengthOf(0)
    })
  })
})
