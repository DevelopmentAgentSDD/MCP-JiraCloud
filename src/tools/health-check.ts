import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';
import type { JiraConfig } from '../types/index.js';

/**
 * Schema de entrada para la tool "jira_health_check".
 * No requiere argumentos.
 */
export const HealthCheckInputSchema = z.object({}).strict();

export type HealthCheckInput = z.infer<typeof HealthCheckInputSchema>;

// ── Raw types from Jira API ─────────────────────────────────────────────────

interface JiraMyselfRawResponse {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
}

// ── Helper types ────────────────────────────────────────────────────────────

interface HealthCheckUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

interface HealthCheckOutput {
  status: 'connected' | 'error';
  user?: HealthCheckUser;
  jiraHost: string;
  timestamp: string;
  error?: string;
}

// ── Handler factory ─────────────────────────────────────────────────────────

/**
 * Crea el handler para la tool "jira_health_check".
 */
export function createHealthCheckHandler(jiraClient: JiraClient, config: JiraConfig) {
  return async () => {
    const timestamp = new Date().toISOString();

    try {
      const response = await jiraClient.get<JiraMyselfRawResponse>('/rest/api/3/myself');

      const raw = response.data;

      const output: HealthCheckOutput = {
        status: 'connected',
        user: {
          accountId: raw.accountId ?? 'unknown',
          displayName: raw.displayName ?? 'Unknown User',
          emailAddress: raw.emailAddress,
        },
        jiraHost: config.host,
        timestamp,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(output),
          },
        ],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      const output: HealthCheckOutput = {
        status: 'error',
        jiraHost: config.host,
        timestamp,
        error: message,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(output),
          },
        ],
        isError: true,
      };
    }
  };
}

// ── MCP Registration ────────────────────────────────────────────────────────

/**
 * Registra la tool "jira_health_check" en el MCP Server.
 * No requiere argumentos de entrada.
 */
export function registerHealthCheck(
  server: McpServer,
  jiraClient: JiraClient,
  config: JiraConfig,
): void {
  const handler = createHealthCheckHandler(jiraClient, config);

  server.tool(
    'jira_health_check',
    "Verify connectivity to Jira Cloud and validate the current authentication credentials. Makes a lightweight call to the Jira API to confirm the host, email, and API token are correctly configured. Returns the authenticated user's identity and Jira instance information. Use this to diagnose connection issues before running other tools.",
    HealthCheckInputSchema.shape,
    handler,
  );
}
