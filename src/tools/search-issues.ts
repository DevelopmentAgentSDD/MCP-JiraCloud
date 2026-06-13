import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Registra la tool "search_issues" en el MCP Server.
 */
export function registerSearchIssues(server: McpServer, _jiraClient: JiraClient): void {
  server.tool(
    'search_issues',
    'Search for issues in Jira using JQL (Jira Query Language). Supports filtering by project, type, status, assignee, priority, labels, sprint, and free-text search. Results are paginated. By default returns the first 50 matching issues. Use this to find existing issues before creating duplicates.',
    {
      jql: z
        .string()
        .optional()
        .describe('Raw JQL query string. If provided, all other filter parameters are ignored.'),
      projectKey: z.string().optional().describe('Project key (e.g., "PROJ"). Filters issues by project.'),
      issueType: z
        .enum(['Task', 'Bug', 'Story', 'Epic', 'Subtask'])
        .optional()
        .describe('Filter by issue type.'),
      status: z.string().optional().describe('Filter by status name (e.g., "In Progress", "Done").'),
      assignee: z
        .string()
        .optional()
        .describe('Filter by assignee. Use account ID, "currentUser()", or "unassigned".'),
      priority: z
        .enum(['Highest', 'High', 'Medium', 'Low', 'Lowest'])
        .optional()
        .describe('Filter by priority level.'),
      labels: z
        .array(z.string())
        .optional()
        .describe('Filter by labels (issues must have ALL specified labels).'),
      sprint: z.string().optional().describe('Filter by sprint name or ID.'),
      text: z.string().optional().describe('Free-text search in summary and description fields.'),
      startAt: z.number().int().min(0).default(0).describe('Pagination offset. Default: 0.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe('Maximum results to return. Default: 50, Max: 100.'),
      orderBy: z
        .string()
        .optional()
        .describe('Sort field and direction (e.g., "created DESC", "priority ASC").'),
      fields: z
        .array(z.string())
        .optional()
        .describe('Specific fields to include in response.'),
    },
    async (_input) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ total: 0, startAt: 0, maxResults: 50, issues: [] }),
          },
        ],
      };
    },
  );
}
