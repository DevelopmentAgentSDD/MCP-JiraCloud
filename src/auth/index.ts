/**
 * Construye el header Basic Auth para Jira Cloud API.
 * El token solo existe en memoria durante la construccion del header.
 * Nunca se serializa, loguea o expone.
 *
 * @param email - Email de la cuenta Atlassian
 * @param apiToken - API Token de Atlassian
 * @returns Header Authorization en formato "Basic base64(email:token)"
 */
export function buildAuthHeader(email: string, apiToken: string): string {
  const credentials = Buffer.from(`${email}:${apiToken}`, 'utf-8').toString('base64');
  return `Basic ${credentials}`;
}
