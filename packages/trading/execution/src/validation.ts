/**
 * Order validation rules and helpers for the execution seam.
 * @module dsh-execution/validation
 */

import type { PlaceOrderRequest, ValidationConfig, ValidationResult } from './types.ts'

/**
 * Validate an order request against constraints and configuration.
 * @param request - the order request to validate.
 * @param config - validation configuration.
 * @returns validation result with errors and warnings.
 */
export function validateOrder(request: PlaceOrderRequest, config: ValidationConfig): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate symbol
  if (!request.symbol || request.symbol.trim().length === 0) {
    errors.push('Symbol is required')
  }

  // Validate side
  if (request.side !== 'buy' && request.side !== 'sell') {
    errors.push(`Invalid side: ${request.side}. Must be 'buy' or 'sell'.`)
  }

  // Validate type
  if (request.type !== 'limit' && request.type !== 'market') {
    errors.push(`Invalid order type: ${request.type}. Must be 'limit' or 'market'.`)
  }

  // Validate quantity
  if (request.quantity <= 0) {
    errors.push(`Quantity must be positive, got ${request.quantity}`)
  }

  if (request.quantity < config.minOrderSize) {
    errors.push(
      `Quantity ${request.quantity} is below minimum order size ${config.minOrderSize}`,
    )
  }

  if (request.quantity > config.maxOrderSize) {
    errors.push(
      `Quantity ${request.quantity} exceeds maximum order size ${config.maxOrderSize}`,
    )
  }

  // Validate fractional shares
  if (!config.allowFractional && !Number.isInteger(request.quantity)) {
    errors.push(`Fractional shares not allowed, got quantity ${request.quantity}`)
  }

  // Validate limit price for limit orders
  if (request.type === 'limit') {
    if (request.limitPrice === undefined || request.limitPrice === null) {
      errors.push('Limit price is required for limit orders')
    } else if (request.limitPrice <= 0) {
      errors.push(`Limit price must be positive, got ${request.limitPrice}`)
    } else {
      // Validate tick size
      const remainder = request.limitPrice % config.minTickSize
      if (Math.abs(remainder) > 1e-10 && Math.abs(remainder - config.minTickSize) > 1e-10) {
        warnings.push(
          `Limit price ${request.limitPrice} does not align with minimum tick size ${config.minTickSize}`,
        )
      }
    }
  }

  // Validate stop price if provided
  if (request.stopPrice !== undefined && request.stopPrice !== null) {
    if (request.stopPrice <= 0) {
      errors.push(`Stop price must be positive, got ${request.stopPrice}`)
    }
  }

  // Validate time-in-force
  if (request.timeInForce) {
    const validTif = ['day', 'gtc', 'ioc', 'fok']
    if (!validTif.includes(request.timeInForce)) {
      errors.push(
        `Invalid time-in-force: ${request.timeInForce}. Must be one of: ${validTif.join(', ')}`,
      )
    }
  }

  // Calculate estimated cost and check balance
  let estimatedCost: number | undefined
  if (request.limitPrice !== undefined && request.limitPrice !== null) {
    estimatedCost = request.quantity * request.limitPrice
  } else if (request.type === 'market') {
    // For market orders, we cannot reliably estimate cost without last price
    // This is handled by the provider's estimateExecutionCost
    estimatedCost = undefined
  }

  if (estimatedCost !== undefined && request.side === 'buy') {
    // Apply safety buffer for slippage (5%)
    const totalCost = estimatedCost * 1.05
    if (totalCost > config.availableBalance) {
      errors.push(
        `Insufficient balance: estimated cost ${estimatedCost.toFixed(2)} (with 5% slippage buffer ${totalCost.toFixed(2)}) exceeds available balance ${config.availableBalance.toFixed(2)}`,
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedCost,
  }
}

/**
 * Validate just the quantity and pricing for quick checks.
 * @param quantity - order quantity.
 * @param price - order price (for buy orders).
 * @param config - validation configuration.
 * @returns true if quantity and price are valid.
 */
export function validateQuantityAndPrice(
  quantity: number,
  price: number | undefined,
  config: ValidationConfig,
): boolean {
  if (quantity <= 0 || quantity < config.minOrderSize || quantity > config.maxOrderSize) {
    return false
  }

  if (!config.allowFractional && !Number.isInteger(quantity)) {
    return false
  }

  if (price !== undefined && price <= 0) {
    return false
  }

  if (price !== undefined) {
    const remainder = price % config.minTickSize
    if (Math.abs(remainder) > 1e-10 && Math.abs(remainder - config.minTickSize) > 1e-10) {
      return false
    }
  }

  return true
}
