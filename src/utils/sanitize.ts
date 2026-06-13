import type { JiraConfig, SanitizedConfig } from '../types/index.js';

/**
 * Sanitiza headers HTTP para logging, redactando el header Authorization.
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };
  if ('authorization' in sanitized) sanitized['authorization'] = 'Basic [REDACTED]';
  if ('Authorization' in sanitized) sanitized['Authorization'] = 'Basic [REDACTED]';
  return sanitized;
}

/**
 * Sanitiza la configuracion para logging, redactando el API token.
 */
export function sanitizeConfigForLogging(config: JiraConfig): SanitizedConfig {
  return {
    host: config.host,
    email: config.email,
    apiToken: config.apiToken ? '***SET***' : 'NOT SET',
  };
}

/**
 * Redacta un token especifico de un texto, reemplazandolo por [REDACTED].
 */
export function redactToken(text: string, token: string): string {
  if (!token) return text;
  return text.replaceAll(token, '[REDACTED]');
}
