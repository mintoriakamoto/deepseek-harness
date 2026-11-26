/**
 * Error handling and validation for the execution seam.
 * @module dsh-execution/errors
 */

import type { ExecutionError } from './types.ts'

/**
 * Create a structured validation error.
 * @param message - human-readable error message.
 * @param details - optional error details.
 * @returns execution error with validation_error code.
 */
export function validationError(message: string, details?: Record<string, unknown>): ExecutionError {
  return {
    code: 'validation_error',
    message,
    details,
  }
}

/**
 * Create an insufficient balance error.
 * @param message - human-readable error message.
 * @param details - optional error details (e.g., required vs. available balance).
 * @returns execution error with insufficient_balance code.
 */
export function insufficientBalanceError(message: string, details?: Record<string, unknown>): ExecutionError {
  return {
    code: 'insufficient_balance',
    message,
    details,
  }
}

/**
 * Create an order not found error.
 * @param orderId - the order ID that was not found.
 * @returns execution error with order_not_found code.
 */
export function orderNotFoundError(orderId: string): ExecutionError {
  return {
    code: 'order_not_found',
    message: `Order not found: ${orderId}`,
    details: { orderId },
  }
}

/**
 * Create an execution rejected error (provider rejected the order).
 * @param message - human-readable error message.
 * @param details - optional error details.
 * @returns execution error with execution_rejected code.
 */
export function executionRejectedError(message: string, details?: Record<string, unknown>): ExecutionError {
  return {
    code: 'execution_rejected',
    message,
    details,
  }
}

/**
 * Create an execution failed error.
 * @param message - human-readable error message.
 * @param details - optional error details.
 * @returns execution error with execution_failed code.
 */
export function executionFailedError(message: string, details?: Record<string, unknown>): ExecutionError {
  return {
    code: 'execution_failed',
    message,
    details,
  }
}

/**
 * Create a network error.
 * @param message - human-readable error message.
 * @param details - optional error details.
 * @returns execution error with network_error code.
 */
export function networkError(message: string, details?: Record<string, unknown>): ExecutionError {
  return {
    code: 'network_error',
    message,
    details,
  }
}

/**
 * Create a provider error.
 * @param message - human-readable error message.
 * @param details - optional error details.
 * @returns execution error with provider_error code.
 */
export function providerError(message: string, details?: Record<string, unknown>): ExecutionError {
  return {
    code: 'provider_error',
    message,
    details,
  }
}

/**
 * Throw an execution error. Used internally to convert errors to structured exceptions.
 * @param error - the execution error to throw.
 * @throws ExecutionErrorException
 */
export function throwExecutionError(error: ExecutionError): never {
  throw new ExecutionErrorException(error)
}

/**
 * Exception wrapping an ExecutionError.
 */
export class ExecutionErrorException extends Error {
  readonly error: ExecutionError

  constructor(error: ExecutionError) {
    super(error.message)
    this.error = error
    this.name = 'ExecutionErrorException'
  }
}

/**
 * Check if an unknown error is an ExecutionErrorException.
 * @param err - the error to check.
 * @returns true if err is an ExecutionErrorException.
 */
export function isExecutionError(err: unknown): err is ExecutionErrorException {
  return err instanceof ExecutionErrorException
}

/**
 * Extract ExecutionError from an exception, with fallback to provider_error.
 * @param err - the error to extract from.
 * @returns structured ExecutionError.
 */
export function toExecutionError(err: unknown): ExecutionError {
  if (isExecutionError(err)) {
    return err.error
  }
  if (err instanceof Error) {
    return providerError(err.message, { stack: err.stack })
  }
  return providerError(String(err))
}
