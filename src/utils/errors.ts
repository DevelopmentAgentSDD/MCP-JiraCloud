import { ErrorCodes } from '../types/index.js';
import type { JsonRpcError } from '../types/index.js';

/**
 * Error base para el MCP Server.
 */
export class McpError extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.data = data;
  }

  /** Convierte a JsonRpcError para serializar en la respuesta */
  toJsonRpcError(): JsonRpcError {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

/**
 * Error de validacion de entrada.
 */
export class ValidationError extends McpError {
  constructor(validationErrors: { path: string; message: string; received?: unknown }[]) {
    super(ErrorCodes.INVALID_PARAMS, 'Invalid parameters. Check the input values.', {
      validationErrors,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Error de autenticacion con Jira.
 */
export class JiraAuthError extends McpError {
  constructor(message?: string) {
    super(
      ErrorCodes.SERVER_ERROR,
      message ||
        'Authentication failed. Verify JIRA_EMAIL and JIRA_API_TOKEN. ' +
          'Generate a new token at https://id.atlassian.com/manage/api-tokens',
    );
    this.name = 'JiraAuthError';
  }
}

/** Conversion factor: milliseconds per second. */
export const MS_PER_SECOND = 1000;

/**
 * Error de rate limit excedido.
 */
export class RateLimitError extends McpError {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(
      ErrorCodes.SERVER_ERROR,
      `Jira API rate limit exceeded. Please wait ${retryAfterMs / MS_PER_SECOND}s and try again.`,
    );
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Error de red / conectividad.
 */
export class NetworkError extends McpError {
  constructor(host: string, cause?: string) {
    super(
      ErrorCodes.SERVER_ERROR,
      `Could not connect to Jira Cloud at ${host}. ${cause || 'Check JIRA_HOST and network connectivity.'}`,
    );
    this.name = 'NetworkError';
  }
}

/**
 * Error de timeout.
 */
export class TimeoutError extends McpError {
  constructor(endpoint: string, timeoutMs: number) {
    super(
      ErrorCodes.SERVER_ERROR,
      `Request to Jira API (${endpoint}) timed out after ${timeoutMs / MS_PER_SECOND} seconds.`,
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Traduce un error HTTP de Jira a un McpError apropiado.
 * Lanza un objeto especial para 429 (capturado por withRetry).
 */
export function mapHttpError(
  status: number,
  body: { errorMessages?: string[]; errors?: Record<string, string> },
  path: string,
): McpError {
  const messages =
    body.errorMessages?.join('; ') || (body.errors ? JSON.stringify(body.errors) : 'Unknown error');

  switch (status) {
    case 401:
      return new JiraAuthError();
    case 403:
      return new McpError(
        ErrorCodes.SERVER_ERROR,
        'Access denied. Your account does not have permission for this action.',
      );
    case 404:
      return new McpError(
        ErrorCodes.SERVER_ERROR,
        `Resource not found at ${path}. Verify the identifier exists and you have access.`,
      );
    case 429:
      throw new RateLimitError(extractRetryAfter(body));
    default:
      if (status >= 500) {
        return new McpError(
          ErrorCodes.SERVER_ERROR,
          `Jira Cloud returned a server error (${status}). Try again later.`,
        );
      }
      return new McpError(ErrorCodes.SERVER_ERROR, `Jira API error (${status}): ${messages}`);
  }
}

/**
 * Extrae el valor Retry-After de la respuesta o headers de error de Jira.
 */
function extractRetryAfter(_body: {
  errorMessages?: string[];
  errors?: Record<string, string>;
}): number {
  return 30_000; // Default 30s si no hay header especifico
}
