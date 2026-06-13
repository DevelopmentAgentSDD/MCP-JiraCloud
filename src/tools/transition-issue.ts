import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Registra la tool "transition_issue" en el MCP Server.
 */
export function registerTransitionIssue(server: McpServer, _jiraClient: JiraClient): void {
  server.tool(
    'transition_issue',
    'Transition an issue through its workflow. You can either execute a transition by name or ID, or list all available transitions from the current state. Some transitions require a resolution (e.g., "Done" may require "Fixed", "Won\'t Fix", etc.). Use listTransitions=true to discover what transitions are available before attempting one.',
    {
      issueKey: z.string().min(1).describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
      transitionName: z
        .string()
        .optional()
        .describe('Human-readable transition name (e.g., "In Progress", "Done").'),
      transitionId: z.string().optional().describe('Numeric transition ID.'),
      resolution: z.string().optional().describe('Resolution name (e.g., "Done", "Fixed").'),
      comment: z.string().optional().describe('Optional comment to add during the transition.'),
      listTransitions: z
        .boolean()
        .default(false)
        .describe('If true, only lists available transitions without executing one.'),
    },
    async (_input) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ key: '', transitioned: false, url: '' }),
          },
        ],
      };
    },
  );
}
