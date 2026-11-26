/**
 * CoinDesk market data provider for crypto volatility and pricing.
 * Provides spot prices, historical bars, and implied volatility surfaces for derivatives pricing.
 * @module @deepseek-ai/dsh-market-data-coindesk
 */

export { CoinDeskProvider } from './provider.js'
export type { CoinDeskConfig } from './provider.js'
export type { Quote, Bar, VolatilitySurface, IVPoint, APIError } from './types.js'
