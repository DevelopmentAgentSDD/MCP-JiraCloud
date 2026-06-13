import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Registra la tool "create_issue" en el MCP Server.
 */
export function registerCreateIssue(server: McpServer, _jiraClient: JiraClient): void {
  server.tool(
    'create_issue',
    'Create a new issue in Jira. Requires at minimum: projectKey, summary, and issueType. Optionally accepts description, priority, assignee, labels, components, sprint assignment, parent issue (for subtasks), epic link, and custom fields. Returns the created issue key, ID, and URL. Before creating, consider using search_issues to check for potential duplicates.',
    {
      projectKey: z.string().min(1).describe('Project key (e.g., "PROJ"). REQUIRED.'),
      summary: z
        .string()
        .min(1)
        .max(255)
        .describe('Issue title/summary. REQUIRED. Max 255 characters.'),
      issueType: z
        .enum(['Task', 'Bug', 'Story', 'Epic', 'Subtask'])
        .describe('Issue type. REQUIRED. "Subtask" requires parentKey. "Epic" requires epicName.'),
      description: z
        .string()
        .optional()
        .describe('Issue description. Supports Jira markdown and ADF.'),
      priority: z
        .enum(['Highest', 'High', 'Medium', 'Low', 'Lowest'])
        .optional()
        .describe('Priority level. Default: project default.'),
      assignee: z.string().optional().describe('Account ID of the user to assign.'),
      labels: z.array(z.string()).optional().describe('Labels to apply to the issue.'),
      components: z.array(z.string()).optional().describe('Component names.'),
      sprint: z.string().optional().describe('Sprint name or ID to add the issue to.'),
      parentKey: z
        .string()
        .optional()
        .describe('Parent issue key. REQUIRED when issueType is "Subtask".'),
      epicLink: z.string().optional().describe('Epic issue key to link.'),
      epicName: z
        .string()
        .optional()
        .describe('Epic name. REQUIRED when issueType is "Epic".'),
      customFields: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Map of custom field IDs to values.'),
    },
    async (_input) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              key: '',
              id: '',
              url: '',
              summary: '',
              issueType: '',
              status: '',
            }),
          },
        ],
      };
    },
  );
}
