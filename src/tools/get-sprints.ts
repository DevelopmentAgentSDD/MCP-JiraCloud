import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Registra la tool "get_sprints" en el MCP Server.
 */
export function registerGetSprints(server: McpServer, _jiraClient: JiraClient): void {
  server.tool(
    'get_sprints',
    'Get sprints from a Jira board. You can specify a boardId directly or provide a boardName to look it up. Filter sprints by state: active, future, or closed. Optionally include the issues within each sprint. Use this to see what work is planned or in progress for a team.',
    {
      boardId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Numeric board ID (e.g., 42). Alternative to boardName.'),
      boardName: z
        .string()
        .optional()
        .describe('Board name to look up (e.g., "PROJ Scrum Board"). Alternative to boardId.'),
      state: z
        .enum(['active', 'future', 'closed'])
        .default('active')
        .describe('Sprint state filter. Default: "active".'),
      includeIssues: z
        .boolean()
        .default(false)
        .describe('If true, includes issues within each sprint in the response.'),
      startAt: z.number().int().min(0).default(0).describe('Pagination offset.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(50)
        .describe('Max sprints to return.'),
    },
    async (_input) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ boardId: 0, boardName: '', total: 0, sprints: [] }),
          },
        ],
      };
    },
  );
}
