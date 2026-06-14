import type { Logger } from 'pino';
import { buildAuthHeader } from '../auth/index.js';
import { withRetry } from '../utils/retry.js';
import { McpError, mapHttpError, NetworkError, TimeoutError } from '../utils/errors.js';
import { sanitizeHeaders } from '../utils/sanitize.js';
import type {
  JiraConfig,
  JiraRequestOptions,
  JiraApiResponse,
  RateLimitConfig,
} from '../types/index.js';
import { DEFAULT_RATE_LIMIT_CONFIG } from '../types/index.js';

/**
 * Cliente HTTP unificado para Jira Cloud API.
 * Usa fetch nativo de Node.js 18+ (ADR-004).
 *
 * Responsabilidades:
 * - Construir URLs completas (baseUrl + path)
 * - Añadir headers de autenticacion Basic Auth
 * - Integrar rate limiting con backoff exponencial
 * - Traducir errores HTTP a McpError con mensajes accionables
 * - Sanitizar headers en logs
 */
export class JiraClient {
  private readonly rateLimitConfig: RateLimitConfig;

  constructor(
    public readonly config: JiraConfig,
    private readonly logger: Logger,
    rateLimitConfig?: Partial<RateLimitConfig>,
  ) {
    this.rateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG, ...rateLimitConfig };
  }

  /**
   * GET request a Jira API.
   */
  async get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    options?: { useAgileApi?: boolean },
  ): Promise<JiraApiResponse<T>> {
    return this.executeRequest<T>({
      method: 'GET',
      path,
      query,
      useAgileApi: options?.useAgileApi,
    });
  }

  /**
   * POST request a Jira API.
   */
  async post<T>(path: string, body?: unknown, isFormData?: boolean): Promise<JiraApiResponse<T>> {
    return this.executeRequest<T>({ method: 'POST', path, body, isFormData });
  }

  /**
   * PUT request a Jira API.
   */
  async put<T>(path: string, body?: unknown): Promise<JiraApiResponse<T>> {
    return this.executeRequest<T>({ method: 'PUT', path, body });
  }

  /**
   * DELETE request a Jira API.
   */
  async delete<T>(path: string): Promise<JiraApiResponse<T>> {
    return this.executeRequest<T>({ method: 'DELETE', path });
  }

  /**
   * Ejecuta un request HTTP a Jira API con rate limiting y manejo de errores.
   */
  private async executeRequest<T>(options: JiraRequestOptions): Promise<JiraApiResponse<T>> {
    const url = this.buildUrl(options);
    const headers = this.buildHeaders(options);

    this.logger.debug(
      {
        method: options.method,
        url,
        headers: sanitizeHeaders(headers),
      },
      'Jira API request',
    );

    return withRetry(
      async () => {
        let body: string | FormData | undefined;

        if (options.body !== undefined) {
          if (options.isFormData) {
            body = options.body as FormData;
          } else {
            body = JSON.stringify(options.body);
          }
        }

        const controller = new AbortController();
        const timeoutMs = options.timeoutMs ?? this.rateLimitConfig.requestTimeoutMs;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(url, {
            method: options.method,
            headers,
            body,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorBody = (await response.json().catch(() => ({}))) as {
              errorMessages?: string[];
              errors?: Record<string, string>;
            };
            throw mapHttpError(response.status, errorBody, options.path);
          }

          // Para respuestas 204 No Content
          if (response.status === 204) {
            return {
              status: response.status,
              data: undefined as T,
              headers: sanitizeHeaders(Object.fromEntries(response.headers.entries())),
            };
          }

          const data = (await response.json()) as T;
          return {
            status: response.status,
            data,
            headers: sanitizeHeaders(Object.fromEntries(response.headers.entries())),
          };
        } catch (error: unknown) {
          clearTimeout(timeoutId);

          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new TimeoutError(options.path, timeoutMs);
          }

          if (error instanceof McpError) {
            throw error;
          }

          // Propagar el throw de rate limit (429) de mapHttpError para withRetry
          if (
            error &&
            typeof error === 'object' &&
            'status' in error &&
            (error as Record<string, unknown>).status === 429
          ) {
            throw error;
          }

          // Error de red
          const cause = error instanceof Error ? error.message : 'Unknown network error';
          throw new NetworkError(this.config.host, cause);
        }
      },
      {
        maxRetries: this.rateLimitConfig.maxRetries,
        baseTimeoutMs: this.rateLimitConfig.baseTimeoutMs,
        logger: this.logger,
      },
    );
  }

  /**
   * Construye la URL completa para un request.
   */
  private buildUrl(options: JiraRequestOptions): string {
    const baseUrl = options.useAgileApi ? this.config.agileBaseUrl : this.config.baseUrl;
    let url = `${baseUrl}${options.path}`;

    if (options.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  /**
   * Construye los headers HTTP para un request.
   */
  private buildHeaders(options: JiraRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: buildAuthHeader(this.config.email, this.config.apiToken),
      Accept: 'application/json',
    };

    if (!options.isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    // Header requerido para bypass CSRF en uploads
    if (options.useAgileApi === false && options.method === 'POST' && options.isFormData) {
      headers['X-Atlassian-Token'] = 'no-check';
    }

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    return headers;
  }
}
