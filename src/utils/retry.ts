import type { Logger } from 'pino';

/**
 * Opciones para la funcion withRetry.
 */
export interface RetryOptions {
  maxRetries: number;
  baseTimeoutMs: number;
  logger?: Logger;
}

/**
 * Resultado de un intento con rate limiting.
 */
export interface RetryAttemptResult<T> {
  success: boolean;
  data?: T;
  error?: {
    status: number;
    message: string;
    retryAfter?: number;
  };
}

/**
 * Ejecuta una funcion asincrona con backoff exponencial en caso de error 429.
 * Respeta el header Retry-After de Jira cuando esta disponible.
 *
 * Estrategia de backoff:
 *   Attempt 1: Wait = max(Retry-After, 30s)
 *   Attempt 2: Wait = max(Retry-After * 2, 60s)
 *   Attempt 3: Wait = max(Retry-After * 4, 120s)
 *
 * @param fn - Funcion asincrona a ejecutar con reintentos
 * @param options - Opciones de configuracion del retry
 * @returns El resultado de la funcion si tiene exito
 * @throws El ultimo error si se agotan los reintentos
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;
  const logger = options.logger;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // Si es un error de rate limit, extraer Retry-After
      const retryAfter = extractRetryAfterMs(error);
      if (retryAfter === null && attempt === options.maxRetries) {
        break;
      }

      if (attempt < options.maxRetries) {
        const waitMs = calculateBackoff(attempt, options.baseTimeoutMs, retryAfter);
        logger?.warn(
          { attempt: attempt + 1, maxRetries: options.maxRetries, waitMs },
          'Retrying Jira API request due to rate limit',
        );
        await sleep(waitMs);
      }
    }
  }

  throw lastError;
}

/**
 * Calcula el tiempo de espera para el siguiente reintento usando backoff exponencial.
 */
function calculateBackoff(
  attempt: number,
  baseTimeoutMs: number,
  retryAfterMs: number | null,
): number {
  const exponentialWait = baseTimeoutMs * Math.pow(2, attempt);
  const retryAfter = retryAfterMs ?? baseTimeoutMs;
  return Math.max(retryAfter, exponentialWait);
}

/**
 * Extrae el valor Retry-After en milisegundos de un error.
 * Retorna null si el error no es un rate limit.
 */
function extractRetryAfterMs(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error && (error as Record<string, unknown>).status === 429) {
    const ra = (error as Record<string, unknown>).retryAfter;
    if (typeof ra === 'number') return ra;
    return 30_000; // Default 30s
  }
  return null;
}

/**
 * Espera asincronamente por el tiempo especificado.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
