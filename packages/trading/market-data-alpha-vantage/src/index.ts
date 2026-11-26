/**
 * Alpha Vantage market data provider plugin.
 *
 * Registers Alpha Vantage as a fallback market data provider when Robinhood or other
 * primary providers are unavailable. Provides quotes and historical bars with caching
 * and rate limit protection.
 *
 * @module @deepseek-ai/dsh-market-data-alpha-vantage
 */

import type { Context } from '@deepseek-ai/cordis'
import type { AlphaVantageConfig } from './types.ts'
import { AlphaVantageProvider } from './provider.ts'

export * from './types.ts'
export { AlphaVantageProvider }

export interface Config extends AlphaVantageConfig {}

/**
 * Plugin injection function: registers Alpha Vantage as a market data provider.
 *
 * Usage in cordis.yml:
 * ```yaml
 * plugins:
 *   - name: '@deepseek-ai/dsh-market-data-alpha-vantage'
 *     config:
 *       apiKey: ${ALPHA_VANTAGE_API_KEY}
 *       debug: true
 * ```
 */
export const name = '@deepseek-ai/dsh-market-data-alpha-vantage'

export const inject = ['marketData']

export async function apply(ctx: Context, config: Config) {
  const provider = new AlphaVantageProvider(config)

  // Register with the market data service.
  ctx.get('marketData').register(provider)
}
