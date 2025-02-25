import { randomBytes } from 'crypto'
import { expect } from 'chai'
import { Mappings } from '../src/pcp/mappings.js' // adjust path as needed
import type { Protocol } from '../src/index.js' // adjust path as needed

describe('PCP Mapping', () => {
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
      const internalHost = 'localhost'
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
      const result = mappings.get('nonexistent.host', 9999, 'TCP')
      expect(result).to.eq(undefined)
    })
  })

  describe('getByNonce', () => {
    it('should return the mapping matching the given nonce', () => {
      const protocol: Protocol = 'TCP'
      const internalHost = 'mail.example.com'
      const internalPort = 25

      const mapping = mappings.getOrCreate(internalHost, internalPort, protocol)
      const found = mappings.getByNonce(mapping.nonce)

      expect(found).to.equal(mapping)
    })

    it('should return undefined for a random nonce that does not exist', () => {
      const protocol: Protocol = 'TCP'
      const internalHost = 'example.com'
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
      const newExternalHost = 'external.example.com'
      const newExternalPort = 6000
      const expiresAt = Date.now() + 10000

      const updated = mappings.update(internalPort, protocol, mapping.nonce, newExternalHost, newExternalPort, expiresAt)
      expect(updated).to.equal(true)

      const updatedMapping = mappings.get(internalHost, internalPort, protocol)
      expect(updatedMapping).to.not.eq(undefined)

      if (updatedMapping !== undefined) {
        expect(updatedMapping.externalHost).to.equal(newExternalHost)
        expect(updatedMapping.externalPort).to.equal(newExternalPort)
        expect(updatedMapping.expiresAt).to.equal(expiresAt)
      }
    })

    it('should not update a mapping if the nonce does not match', () => {
      const protocol: Protocol = 'UDP'
      const internalHost = '10.0.0.2'
      const internalPort = 7000

      mappings.getOrCreate(internalHost, internalPort, protocol)
      const newExternalHost = 'external.example.net'
      const newExternalPort = 8000
      const expiresAt = Date.now() + 20000

      // Generate a wrong nonce
      const wrongNonce = randomBytes(12)
      const updated = mappings.update(internalPort, protocol, wrongNonce, newExternalHost, newExternalPort, expiresAt)
      expect(updated).to.equal(false)

      // The mapping should remain unchanged
      const mapping = mappings.get(internalHost, internalPort, protocol)
      expect(mapping).to.not.eq(undefined)

      if (mapping !== undefined) {
        expect(mapping.externalHost).to.eq(undefined)
        expect(mapping.externalPort).to.eq(undefined)
        expect(mapping.expiresAt).to.eq(undefined)
      }
    })

    it('should update mapping regardless of protocol case', () => {
      const protocol: Protocol = 'tcp'
      const internalHost = '192.168.0.1'
      const internalPort = 8081

      const mapping = mappings.getOrCreate(internalHost, internalPort, protocol)
      const newExternalHost = 'host.example.org'
      const newExternalPort = 9090
      const expiresAt = Date.now() + 5000

      // Update using a different case for the protocol
      const updated = mappings.update(internalPort, protocol.toUpperCase() as Protocol, mapping.nonce, newExternalHost, newExternalPort, expiresAt)
      expect(updated).to.equal(true)

      const updatedMapping = mappings.get(internalHost, internalPort, protocol)
      expect(updatedMapping).to.not.eq(undefined)

      if (updatedMapping !== undefined) {
        expect(updatedMapping.externalHost).to.equal(newExternalHost)
        expect(updatedMapping.externalPort).to.equal(newExternalPort)
        expect(updatedMapping.expiresAt).to.equal(expiresAt)
      }
    })
  })

  describe('delete', () => {
    it('should delete the mapping that matches the provided criteria', () => {
      const protocol: Protocol = 'TCP'
      const internalHost = 'localhost'
      const internalPort = 1234

      mappings.getOrCreate(internalHost, internalPort, protocol)
      expect(mappings.get(internalHost, internalPort, protocol)).to.not.eq(undefined)

      mappings.delete(internalHost, internalPort, protocol)
      expect(mappings.get(internalHost, internalPort, protocol)).to.eq(undefined)
    })

    it('should not delete other mappings when deleting one', () => {
      mappings.getOrCreate('host1', 1111, 'TCP')
      const mapping2 = mappings.getOrCreate('host2', 2222, 'TCP')

      mappings.delete('host1', 1111, 'TCP')
      expect(mappings.get('host1', 1111, 'TCP')).to.eq(undefined)
      expect(mappings.get('host2', 2222, 'TCP')).to.equal(mapping2)
    })
  })

  describe('deleteAll', () => {
    it('should remove all mappings', () => {
      mappings.getOrCreate('host1', 1111, 'TCP')
      mappings.getOrCreate('host2', 2222, 'UDP')

      expect(mappings.getAll().length).to.be.greaterThan(0)

      mappings.deleteAll()
      expect(mappings.getAll()).to.have.lengthOf(0)
    })
  })
})
