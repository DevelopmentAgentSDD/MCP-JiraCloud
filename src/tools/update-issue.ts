import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Registra la tool "update_issue" en el MCP Server.
 */
export function registerUpdateIssue(server: McpServer, _jiraClient: JiraClient): void {
  server.tool(
    'update_issue',
    'Update editable fields of an existing issue. You can modify: summary, description, priority, labels, components, and custom fields. To change the issue status, use transition_issue instead. At least one field besides issueKey must be provided. Labels and components completely replace existing values.',
    {
      issueKey: z.string().min(1).describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
      summary: z
        .string()
        .min(1)
        .max(255)
        .optional()
        .describe('New summary for the issue.'),
      description: z
        .string()
        .optional()
        .describe('New description. Supports Jira markdown and ADF.'),
      priority: z
        .enum(['Highest', 'High', 'Medium', 'Low', 'Lowest'])
        .optional()
        .describe('New priority level.'),
      labels: z
        .array(z.string())
        .optional()
        .describe('New labels. REPLACES all existing labels.'),
      components: z
        .array(z.string())
        .optional()
        .describe('New components. REPLACES all existing components.'),
      customFields: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Custom field updates.'),
    },
    async (_input) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              key: '',
              updated: false,
              changedFields: [],
              url: '',
            }),
          },
        ],
      };
    },
  );
}
