/**
 * Risk policy service: pre-execution risk gates for portfolio management.
 *
 * Providers register implementations via {@link RiskPolicyRegistry.register}, supporting
 * multi-provider fallback for risk assessment. Each provider can implement
 * default forecasting, stress testing, and correlation analysis.
 *
 * @module @deepseek-ai/dsh-risk-policy
 */

import { Context, Service, symbols } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import type {
  Position,
  RiskProvider,
  RiskConfig,
  RiskAssessment,
  DefaultForecast,
  StressScenario,
  CorrelationMatrix,
} from './types.ts'

export * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    riskPolicy: RiskPolicyRegistry
  }
}

/**
 * Registered provider with its owning fiber (for disposal tracking in HMR).
 */
interface RegisteredProvider {
  provider: RiskProvider
  fiber: Fiber
}

/**
 * Service: multi-provider registry for risk assessment and stress testing.
 *
 * Providers register in order and are tried in sequence until one supports
 * the requested operation. Disposal of a provider's fiber automatically
 * unregisters it.
 */
export class RiskPolicyRegistry extends Service {
  private providers: RegisteredProvider[] = []

  constructor(ctx: Context) {
    super(ctx, 'riskPolicy')
  }

  /**
   * Register a provider implementation. Returns the disposer; disposal removes the provider.
   */
  register(provider: RiskProvider): () => void {
    // Access current fiber through cordis internal symbols
    // Using 'as any' to bypass strict symbol type checking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiber = (this.ctx as any)[(symbols as any).current] as Fiber | undefined
    if (!fiber) {
      throw new Error('Provider registration requires active fiber context')
    }
    const entry: RegisteredProvider = { provider, fiber }
    this.providers.push(entry)

    return () => {
      const idx = this.providers.indexOf(entry)
      if (idx !== -1) {
        this.providers.splice(idx, 1)
      }
    }
  }

  /**
   * Get default probability forecast for a symbol.
   * Tries each provider in sequence until one succeeds.
   */
  async getDefaultForecast(symbol: string, provider?: string): Promise<DefaultForecast> {
    const providers = provider
      ? this.providers.filter(p => p.provider.name === provider)
      : this.providers

    if (providers.length === 0) {
      throw new Error(
        provider ? `No provider registered: ${provider}` : 'No risk providers registered',
      )
    }

    let lastError: Error | null = null

    for (const { provider: p } of providers) {
      if (!p.getDefaultForecast) {
        const msg = `Provider ${p.name} does not support getDefaultForecast`
        lastError = new Error(msg)
        continue
      }

      try {
        return await p.getDefaultForecast(symbol)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError) throw lastError
    throw new Error('All providers failed: getDefaultForecast')
  }

  /**
   * Get stress test scenarios for the portfolio.
   * Tries each provider in sequence until one succeeds.
   */
  async getStressScenarios(positions: Position[], provider?: string): Promise<StressScenario[]> {
    const providers = provider
      ? this.providers.filter(p => p.provider.name === provider)
      : this.providers

    if (providers.length === 0) {
      throw new Error(
        provider ? `No provider registered: ${provider}` : 'No risk providers registered',
      )
    }

    let lastError: Error | null = null

    for (const { provider: p } of providers) {
      if (!p.getStressScenarios) {
        const msg = `Provider ${p.name} does not support getStressScenarios`
        lastError = new Error(msg)
        continue
      }

      try {
        return await p.getStressScenarios(positions)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError) throw lastError
    throw new Error('All providers failed: getStressScenarios')
  }

  /**
   * Get correlation matrix for portfolio assets.
   * Tries each provider in sequence until one succeeds.
   */
  async getCorrelationMatrix(symbols: string[], provider?: string): Promise<CorrelationMatrix> {
    const providers = provider
      ? this.providers.filter(p => p.provider.name === provider)
      : this.providers

    if (providers.length === 0) {
      throw new Error(
        provider ? `No provider registered: ${provider}` : 'No risk providers registered',
      )
    }

    let lastError: Error | null = null

    for (const { provider: p } of providers) {
      if (!p.getCorrelationMatrix) {
        const msg = `Provider ${p.name} does not support getCorrelationMatrix`
        lastError = new Error(msg)
        continue
      }

      try {
        return await p.getCorrelationMatrix(symbols)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError) throw lastError
    throw new Error('All providers failed: getCorrelationMatrix')
  }

  /**
   * Assess risk for a proposed trade.
   * Tries each provider in sequence until one succeeds.
   */
  async assessRisk(
    position: Position,
    portfolio: Position[],
    config: RiskConfig,
    provider?: string,
  ): Promise<RiskAssessment> {
    const providers = provider
      ? this.providers.filter(p => p.provider.name === provider)
      : this.providers

    if (providers.length === 0) {
      throw new Error(
        provider ? `No provider registered: ${provider}` : 'No risk providers registered',
      )
    }

    let lastError: Error | null = null

    for (const { provider: p } of providers) {
      if (!p.assessRisk) {
        const msg = `Provider ${p.name} does not support assessRisk`
        lastError = new Error(msg)
        continue
      }

      try {
        return await p.assessRisk(position, portfolio, config)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError) throw lastError
    throw new Error('All providers failed: assessRisk')
  }
}

export default RiskPolicyRegistry
