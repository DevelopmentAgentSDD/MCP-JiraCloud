import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Registra la tool "manage_comments" en el MCP Server.
 */
export function registerManageComments(server: McpServer, _jiraClient: JiraClient): void {
  server.tool(
    'manage_comments',
    'Manage comments on a Jira issue. Use action "list" to read all comments, or action "add" to create a new comment. Comments support Jira markdown syntax including @mentions. When adding, the body field is required. The list action supports pagination.',
    {
      action: z
        .enum(['list', 'add'])
        .describe('Action to perform: "list" to read comments or "add" to create a new comment.'),
      issueKey: z.string().min(1).describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
      body: z
        .string()
        .optional()
        .describe('Comment text. Supports Jira markdown. REQUIRED when action is "add".'),
      startAt: z
        .number()
        .int()
        .min(0)
        .default(0)
        .optional()
        .describe('Pagination offset (for "list" action).'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .optional()
        .describe('Max comments to return (for "list" action).'),
    },
    async (_input) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              issueKey: '',
              total: 0,
              startAt: 0,
              maxResults: 0,
              comments: [],
            }),
          },
        ],
      };
    },
  );
}
