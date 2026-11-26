/**
 * CoinDesk market data types.
 */

/**
 * Spot price quote for a cryptocurrency asset.
 */
export interface Quote {
  /** Asset symbol (e.g., "BTC", "ETH") */
  symbol: string
  /** Price in USD */
  price: number
  /** Timestamp of the quote (ISO 8601) */
  timestamp: string
  /** 24-hour change percentage */
  change24h: number
  /** 24-hour high price */
  high24h: number
  /** 24-hour low price */
  low24h: number
  /** 24-hour volume in USD */
  volume24h: number
}

/**
 * Historical price bar (OHLCV data).
 */
export interface Bar {
  /** Bar timestamp (ISO 8601) */
  timestamp: string
  /** Opening price */
  open: number
  /** High price */
  high: number
  /** Low price */
  low: number
  /** Closing price */
  close: number
  /** Trading volume */
  volume: number
}

/**
 * Individual point on the IV surface.
 */
export interface IVPoint {
  /** Strike price (as % of spot) */
  strike: number
  /** Time to expiration in days */
  daysToExpiration: number
  /** Implied volatility (as decimal, e.g., 0.25 = 25%) */
  impliedVol: number
  /** Mid-price (optional) */
  midPrice?: number
}

/**
 * Implied volatility surface for derivatives pricing.
 * Represents the IV smile and term structure.
 */
export interface VolatilitySurface {
  /** Asset symbol */
  symbol: string
  /** Spot price at surface generation */
  spotPrice: number
  /** Surface generation timestamp */
  timestamp: string
  /** Array of IV surface points */
  points: IVPoint[]
  /** Minimum strike (as % of spot) */
  minStrike: number
  /** Maximum strike (as % of spot) */
  maxStrike: number
  /** Minimum time to expiration (days) */
  minDTE: number
  /** Maximum time to expiration (days) */
  maxDTE: number
}

/**
 * API error response.
 */
export interface APIError {
  /** Error code */
  code: string
  /** Error message */
  message: string
  /** Error details */
  details?: Record<string, unknown>
}
