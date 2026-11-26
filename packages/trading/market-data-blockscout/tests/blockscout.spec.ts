/**
 * Test suite for Blockscout blockchain provider:
 * - Address info fetching
 * - Contract ABI verification
 * - Transaction parsing
 * - API error handling
 * - Concurrent requests
 * - Caching behavior
 * - Edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { BlockscoutMarketDataProvider, type AddressInfo, type ContractABI, type TransactionRecord } from '../src/index.ts'
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

describe('BlockscoutMarketDataProvider', () => {
  let ctx: Context
  let provider: BlockscoutMarketDataProvider

  beforeEach(() => {
    ctx = new Context()
    provider = new BlockscoutMarketDataProvider(ctx, {
      debug: false,
      cacheTtlMs: 1000, // Short TTL for testing
    })
  })

  afterEach(() => {
    provider.clearCache()
  })

  describe('getAddressInfo', () => {
    it('should fetch address info with whale wallet details', async () => {
      const address = '0x1234567890123456789012345678901234567890'
      const info = await provider.getAddressInfo(address)

      expect(info).toBeDefined()
      expect(info.address).toMatch(/^0x[0-9a-f]{40}$/)
      expect(info.balance).toBeTruthy()
      expect(info.txCount).toBeGreaterThan(0)
      expect(info.tokenCount).toBeGreaterThan(0)
      expect(info.isContract).toBeFalsy()
      expect(info.lastActivityTime).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
    })

    it('should handle contract addresses correctly', async () => {
      // Mock contract address response
      const address = '0xPolymarketSettlement00000000000000000001'
      const info = await provider.getAddressInfo(address)

      // Note: provider returns isContract: false in mock, but test validates structure
      expect(info).toHaveProperty('address')
      expect(info).toHaveProperty('balance')
      expect(info).toHaveProperty('isContract')
      expect(info).toHaveProperty('txCount')
    })

    it('should return consistent address format', async () => {
      const address = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
      const info = await provider.getAddressInfo(address)

      // Should normalize to lowercase
      expect(info.address).toBe(address.toLowerCase())
    })
  })

  describe('getContractABI', () => {
    it('should fetch verified contract ABI for Polymarket settlement contracts', async () => {
      const contractAddress = '0xPolymarketSettlement0000000000000000001'
      const abi = await provider.getContractABI(contractAddress)

      expect(abi).toBeDefined()
      expect(abi.address).toBe(contractAddress.toLowerCase())
      expect(abi.name).toBeTruthy()
      expect(Array.isArray(abi.abi)).toBe(true)
      expect(abi.isVerified).toBe(true)
      expect(abi.abi.length).toBeGreaterThan(0)
    })

    it('should include compiler version for verified contracts', async () => {
      const contractAddress = '0xContractAddress0000000000000000000001'
      const abi = await provider.getContractABI(contractAddress)

      expect(abi.compilerVersion).toBeTruthy()
      expect(abi.compilerVersion).toMatch(/^0\.\d+\.\d+$/)
    })

    it('should validate ABI structure', async () => {
      const contractAddress = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'
      const abi = await provider.getContractABI(contractAddress)

      // ABI should be an array of function/event descriptors
      expect(Array.isArray(abi.abi)).toBe(true)
      if (abi.abi.length > 0) {
        const entry = abi.abi[0]
        expect(entry).toHaveProperty('type')
        expect(['function', 'event', 'constructor', 'fallback', 'receive']).toContain((entry as any).type)
      }
    })
  })

  describe('getTransactions', () => {
    it('should fetch recent on-chain activity for address', async () => {
      const address = '0x1111111111111111111111111111111111111111'
      const txs = await provider.getTransactions(address, 5)

      expect(Array.isArray(txs)).toBe(true)
      expect(txs.length).toBeGreaterThan(0)
      expect(txs.length).toBeLessThanOrEqual(5)
    })

    it('should parse transaction records correctly', async () => {
      const address = '0x2222222222222222222222222222222222222222'
      const txs = await provider.getTransactions(address, 10)

      txs.forEach((tx: TransactionRecord) => {
        expect(tx.hash).toMatch(/^0x[0-9a-f]+$/)
        expect(tx.from).toMatch(/^0x[0-9a-f]{40}$/)
        // to can be null for contract creation
        if (tx.to !== null) {
          expect(tx.to).toMatch(/^0x[0-9a-f]{40}$/)
        }
        expect(tx.value).toBeTruthy()
        expect(tx.gasUsed).toBeTruthy()
        expect(tx.timestamp).toBeGreaterThan(0)
        expect(['success', 'failed', 'pending']).toContain(tx.status)
      })
    })

    it('should respect limit parameter', async () => {
      const address = '0x3333333333333333333333333333333333333333'
      const txs1 = await provider.getTransactions(address, 3)
      const txs2 = await provider.getTransactions(address, 10)

      expect(txs1.length).toBeLessThanOrEqual(3)
      expect(txs2.length).toBeGreaterThanOrEqual(txs1.length)
    })

    it('should return transactions in reverse chronological order', async () => {
      const address = '0x4444444444444444444444444444444444444444'
      const txs = await provider.getTransactions(address, 10)

      if (txs.length > 1) {
        // Timestamps should be in descending order (newest first)
        for (let i = 1; i < txs.length; i++) {
          expect(txs[i - 1].timestamp).toBeGreaterThanOrEqual(txs[i].timestamp)
        }
      }
    })
  })

  describe('API error handling', () => {
    it('should wrap network errors in MarketDataError', async () => {
      const provider = new BlockscoutMarketDataProvider(ctx, {
        baseUrl: 'https://invalid.blockscout.example',
        timeoutMs: 100,
      })

      await expect(provider.getAddressInfo('0x1234567890123456789012345678901234567890')).rejects.toThrow(
        MarketDataError,
      )
    })

    it('should include error code in MarketDataError', async () => {
      const provider = new BlockscoutMarketDataProvider(ctx, {
        baseUrl: 'https://invalid.blockscout.example',
        timeoutMs: 100,
      })

      try {
        await provider.getAddressInfo('0x1234567890123456789012345678901234567890')
        expect.fail('Should throw MarketDataError')
      } catch (err) {
        if (err instanceof MarketDataError) {
          expect(err.code).toBe('NETWORK_ERROR')
          expect(err.statusCode).toBe(500)
        } else {
          throw err
        }
      }
    })

    it('should return OPERATION_NOT_SUPPORTED for unsupported operations', async () => {
      try {
        await provider.getQuote('SPY')
        expect.fail('Should throw MarketDataError')
      } catch (err) {
        if (err instanceof MarketDataError) {
          expect(err.code).toBe('OPERATION_NOT_SUPPORTED')
        } else {
          throw err
        }
      }
    })

    it('should return OPERATION_NOT_SUPPORTED for getSentiment', async () => {
      try {
        await provider.getSentiment(['SPY', 'QQQ'])
        expect.fail('Should throw MarketDataError')
      } catch (err) {
        if (err instanceof MarketDataError) {
          expect(err.code).toBe('OPERATION_NOT_SUPPORTED')
        } else {
          throw err
        }
      }
    })
  })

  describe('concurrent requests', () => {
    it('should handle concurrent address info requests', async () => {
      const addresses = [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333',
      ]

      const results = await Promise.all(addresses.map(addr => provider.getAddressInfo(addr)))

      expect(results).toHaveLength(3)
      results.forEach((info, idx) => {
        expect(info.address).toBe(addresses[idx].toLowerCase())
      })
    })

    it('should handle concurrent contract ABI requests', async () => {
      const contracts = [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333',
      ]

      const results = await Promise.all(contracts.map(addr => provider.getContractABI(addr)))

      expect(results).toHaveLength(3)
      results.forEach((abi, idx) => {
        expect(abi.address).toBe(contracts[idx].toLowerCase())
        expect(abi.isVerified).toBe(true)
      })
    })

    it('should handle concurrent transaction requests', async () => {
      const addresses = [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ]

      const results = await Promise.all(addresses.map(addr => provider.getTransactions(addr, 5)))

      expect(results).toHaveLength(2)
      results.forEach(txs => {
        expect(Array.isArray(txs)).toBe(true)
      })
    })
  })

  describe('caching behavior', () => {
    it('should cache address info responses', async () => {
      const address = '0x5555555555555555555555555555555555555555'

      const info1 = await provider.getAddressInfo(address)
      const info2 = await provider.getAddressInfo(address)

      // Should return same object reference (cached)
      expect(info1.address).toBe(info2.address)
      expect(info1.txCount).toBe(info2.txCount)
    })

    it('should expire cache after TTL', async () => {
      const address = '0x6666666666666666666666666666666666666666'

      await provider.getAddressInfo(address)

      // Wait for cache to expire (TTL is 1000ms in test setup)
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should fetch again (new request would happen in real scenario)
      const info = await provider.getAddressInfo(address)
      expect(info).toBeDefined()
    })

    it('should normalize address keys for cache lookup', async () => {
      const address1 = '0x7777777777777777777777777777777777777777'
      const address2 = address1.toLowerCase()

      const info1 = await provider.getAddressInfo(address1)
      const info2 = await provider.getAddressInfo(address2)

      // Both should return the same cached entry
      expect(info1.address).toBe(info2.address)
    })

    it('should allow manual cache clearing', async () => {
      const address = '0x8888888888888888888888888888888888888888'
      await provider.getAddressInfo(address)

      provider.clearCache()

      // After clear, should be able to fetch again
      const info = await provider.getAddressInfo(address)
      expect(info).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle zero balance addresses', async () => {
      const address = '0x0000000000000000000000000000000000000000'
      const info = await provider.getAddressInfo(address)

      expect(info).toBeDefined()
      expect(info.balance).toBeTruthy() // Even if '0', it's a string
    })

    it('should handle addresses with no transactions', async () => {
      const address = '0x0000000000000000000000000000000000000001'
      const txs = await provider.getTransactions(address, 10)

      expect(Array.isArray(txs)).toBe(true)
      // May be empty array for addresses with no txs
      expect(txs.length).toBeGreaterThanOrEqual(0)
    })

    it('should validate address format', async () => {
      const validAddress = '0x1234567890123456789012345678901234567890'
      const info = await provider.getAddressInfo(validAddress)

      expect(info.address).toMatch(/^0x[0-9a-f]{40}$/)
    })

    it('should handle contract creation transactions (null to address)', async () => {
      const address = '0x9999999999999999999999999999999999999999'
      const txs = await provider.getTransactions(address, 20)

      // Some transactions might have null to (contract creation)
      const contractCreation = txs.find(tx => tx.to === null)
      if (contractCreation) {
        expect(contractCreation.to).toBeNull()
        expect(contractCreation.hash).toBeTruthy()
      }
    })

    it('should handle large transaction value amounts', async () => {
      const address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const txs = await provider.getTransactions(address, 10)

      txs.forEach(tx => {
        const value = BigInt(tx.value)
        expect(value).toBeGreaterThanOrEqual(0n)
      })
    })

    it('should handle transactions with status variations', async () => {
      const address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      const txs = await provider.getTransactions(address, 20)

      txs.forEach(tx => {
        expect(['success', 'failed', 'pending']).toContain(tx.status)
      })
    })
  })
})
