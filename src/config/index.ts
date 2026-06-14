import { z } from 'zod';
import type { JiraConfig, SanitizedConfig } from '../types/index.js';

/**
 * Schema de validacion para variables de entorno.
 */
export const EnvSchema = z.object({
  JIRA_HOST: z
    .string()
    .min(
      1,
      'JIRA_HOST is required. Set it to your Jira Cloud domain (e.g., "my-company.atlassian.net").',
    )
    .refine((val) => !val.startsWith('https://') && !val.startsWith('http://'), {
      message:
        'JIRA_HOST must not include protocol (e.g., "my-company.atlassian.net", not "https://...").',
    }),
  JIRA_EMAIL: z
    .string()
    .min(1, 'JIRA_EMAIL is required. Set it to your Atlassian account email.')
    .email('JIRA_EMAIL must be a valid email address.'),
  JIRA_API_TOKEN: z
    .string()
    .min(
      1,
      'JIRA_API_TOKEN is required. Generate one at https://id.atlassian.com/manage/api-tokens',
    ),
});

export type EnvVars = z.infer<typeof EnvSchema>;

/**
 * Carga y valida la configuracion desde variables de entorno.
 * Lanza error descriptivo si falta alguna variable requerida.
 */
export function loadConfig(): JiraConfig {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration error:\n${errors}`);
  }

  const { JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN } = result.data;

  return {
    host: JIRA_HOST,
    email: JIRA_EMAIL,
    apiToken: JIRA_API_TOKEN,
    baseUrl: `https://${JIRA_HOST}/rest/api/3`,
    agileBaseUrl: `https://${JIRA_HOST}/rest/agile/1.0`,
  };
}

/**
 * Obtiene una version sanitizada de la configuracion para logging.
 */
export function sanitizeConfig(config: JiraConfig): SanitizedConfig {
  return {
    host: config.host,
    email: config.email,
    apiToken: config.apiToken ? '***SET***' : 'NOT SET',
  };
}
