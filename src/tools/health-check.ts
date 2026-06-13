import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';
import type { JiraConfig } from '../types/index.js';

/**
 * Registra la tool "jira_health_check" en el MCP Server.
 * No requiere argumentos de entrada.
 */
export function registerHealthCheck(
  server: McpServer,
  _jiraClient: JiraClient,
  config: JiraConfig,
): void {
  server.tool(
    'jira_health_check',
    'Verify connectivity to Jira Cloud and validate the current authentication credentials. Makes a lightweight call to the Jira API to confirm the host, email, and API token are correctly configured. Returns the authenticated user\'s identity and Jira instance information. Use this to diagnose connection issues before running other tools.',
    async () => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              status: 'connected',
              jiraHost: config.host,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      };
    },
  );
}
