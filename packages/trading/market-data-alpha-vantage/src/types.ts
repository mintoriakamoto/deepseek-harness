/**
 * Configuration types for Alpha Vantage market data provider.
 *
 * @module @deepseek-ai/dsh-market-data-alpha-vantage/types
 */

/**
 * Configuration for Alpha Vantage market data provider.
 */
export interface AlphaVantageConfig {
  /** Alpha Vantage API key (optional; uses ALPHA_VANTAGE_API_KEY env var if omitted). */
  apiKey?: string
  /** Quote cache TTL in milliseconds (default: 5 minutes). */
  quoteCacheTtlMs?: number
  /** Request timeout in milliseconds (default: 10 seconds). */
  requestTimeoutMs?: number
  /** Enable debug logging. */
  debug?: boolean
}

/**
 * Alpha Vantage API response for GLOBAL_QUOTE endpoint.
 */
export interface AlphaVantageQuoteResponse {
  'Global Quote': {
    '01. symbol': string
    '05. price': string
    '02. open': string
    '03. high': string
    '04. low': string
    '06. volume': string
    '10. change percent': string
  }
  'Note'?: string
  'Error Message'?: string
}

/**
 * Alpha Vantage API response for TIME_SERIES endpoints.
 */
export interface AlphaVantageBarsResponse {
  'Time Series (Daily)'?: Record<string, Record<string, string>>
  'Time Series (Weekly)'?: Record<string, Record<string, string>>
  'Time Series (Monthly)'?: Record<string, Record<string, string>>
  'Time Series (Intraday)'?: Record<string, Record<string, string>>
  'Meta Data'?: Record<string, string>
  'Note'?: string
  'Error Message'?: string
}
