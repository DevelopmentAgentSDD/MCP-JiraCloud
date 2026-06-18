import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Schema de entrada para la tool "assign_user".
 * accountId puede ser null para desasignar.
 */
export const AssignUserInputSchema = z
  .object({
    issueKey: z.string().min(1).describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
    accountId: z
      .string()
      .nullable()
      .describe(
        'Atlassian Account ID of the user to assign. Use null or "unassigned" to unassign. REQUIRED.',
      ),
  })
  .strict();

export type AssignUserInput = z.infer<typeof AssignUserInputSchema>;

// ── Raw types from Jira API ─────────────────────────────────────────────────

interface JiraAssignRawResponse {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
}

// ── Helper types ────────────────────────────────────────────────────────────

interface AssigneeInfo {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

interface AssignUserOutput {
  key: string;
  assignee: AssigneeInfo | null;
  url: string;
}

// ── Handler factory ─────────────────────────────────────────────────────────

/**
 * Crea el handler para la tool "assign_user".
 */
export function createAssignUserHandler(jiraClient: JiraClient) {
  return async (input: AssignUserInput) => {
    const host = jiraClient.config.host;
    const issueKey = input.issueKey;

    // Determine if this is an unassign operation
    const isUnassign = input.accountId === null || input.accountId === 'unassigned';

    if (isUnassign) {
      // Unassign: PUT with accountId: null
      await jiraClient.put(`/rest/api/3/issue/${issueKey}/assignee`, {
        accountId: null,
      });

      const output: AssignUserOutput = {
        key: issueKey,
        assignee: null,
        url: `https://${host}/browse/${issueKey}`,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    }

    // Assign user
    const response = await jiraClient.put<JiraAssignRawResponse>(
      `/rest/api/3/issue/${issueKey}/assignee`,
      { accountId: input.accountId },
    );

    const assignee = response.data;

    const output: AssignUserOutput = {
      key: issueKey,
      assignee: {
        accountId: assignee.accountId ?? input.accountId ?? '',
        displayName: assignee.displayName ?? 'Unknown',
        emailAddress: assignee.emailAddress,
      },
      url: `https://${host}/browse/${issueKey}`,
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    };
  };
}

// ── MCP Registration ────────────────────────────────────────────────────────

/**
 * Registra la tool "assign_user" en el MCP Server.
 */
export function registerAssignUser(server: McpServer, jiraClient: JiraClient): void {
  const handler = createAssignUserHandler(jiraClient);

  server.tool(
    'assign_user',
    'Assign a user to an issue or unassign the current user. Provide the issue key and the account ID of the user to assign. To unassign, use accountId: null or accountId: "unassigned". The assignee must have access to the issue\'s project.',
    AssignUserInputSchema.shape,
    handler,
  );
}
