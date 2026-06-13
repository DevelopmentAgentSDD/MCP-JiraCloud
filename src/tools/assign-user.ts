import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Registra la tool "assign_user" en el MCP Server.
 */
export function registerAssignUser(server: McpServer, _jiraClient: JiraClient): void {
  server.tool(
    'assign_user',
    'Assign a user to an issue or unassign the current user. Provide the issue key and the account ID of the user to assign. To unassign, use accountId: null or accountId: "unassigned". The assignee must have access to the issue\'s project.',
    {
      issueKey: z.string().min(1).describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
      accountId: z
        .string()
        .nullable()
        .describe(
          'Atlassian Account ID of the user to assign. Use null or "unassigned" to unassign. REQUIRED.',
        ),
    },
    async (_input) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ key: '', assignee: null, url: '' }),
          },
        ],
      };
    },
  );
}
