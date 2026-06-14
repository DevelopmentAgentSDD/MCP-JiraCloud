import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

const updateIssueShape = {
  issueKey: z.string().min(1).describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
  summary: z.string().min(1).max(255).optional().describe('New summary for the issue.'),
  description: z.string().optional().describe('New description. Supports Jira markdown and ADF.'),
  priority: z
    .enum(['Highest', 'High', 'Medium', 'Low', 'Lowest'])
    .optional()
    .describe('New priority level.'),
  labels: z
    .array(z.string().min(1))
    .optional()
    .describe('New labels. REPLACES all existing labels.'),
  components: z
    .array(z.string().min(1))
    .optional()
    .describe('New components. REPLACES all existing components.'),
  customFields: z.record(z.string(), z.unknown()).optional().describe('Custom field updates.'),
};

/**
 * Schema de entrada para la tool "update_issue".
 * Validación: al menos un campo además de issueKey debe estar presente.
 */
export const UpdateIssueInputSchema = z
  .object(updateIssueShape)
  .strict()
  .refine(
    (data) => {
      const updatableKeys: (keyof typeof data)[] = [
        'summary',
        'description',
        'priority',
        'labels',
        'components',
        'customFields',
      ];
      return updatableKeys.some((k) => data[k] !== undefined);
    },
    {
      message: 'At least one field to update must be provided besides issueKey.',
    },
  );

export type UpdateIssueInput = z.infer<typeof UpdateIssueInputSchema>;

// ── Payload builder ─────────────────────────────────────────────────────────

function buildUpdatePayload(input: UpdateIssueInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (input.summary !== undefined) fields.summary = input.summary;
  if (input.description !== undefined) fields.description = input.description;
  if (input.priority !== undefined) fields.priority = { name: input.priority };
  if (input.labels !== undefined) fields.labels = input.labels;
  if (input.components !== undefined)
    fields.components = input.components.map((c) => ({ name: c }));
  if (input.customFields) Object.assign(fields, input.customFields);

  return { fields };
}

function getChangedFields(input: UpdateIssueInput): string[] {
  const changed: string[] = [];
  if (input.summary !== undefined) changed.push('summary');
  if (input.description !== undefined) changed.push('description');
  if (input.priority !== undefined) changed.push('priority');
  if (input.labels !== undefined) changed.push('labels');
  if (input.components !== undefined) changed.push('components');
  if (input.customFields) changed.push(...Object.keys(input.customFields));
  return changed;
}

// ── Handler factory ─────────────────────────────────────────────────────────

interface UpdateIssueOutput {
  key: string;
  updated: boolean;
  changedFields: string[];
  url: string;
}

/**
 * Crea el handler para la tool "update_issue".
 */
export function createUpdateIssueHandler(jiraClient: JiraClient) {
  return async (input: UpdateIssueInput) => {
    const payload = buildUpdatePayload(input);
    const changedFields = getChangedFields(input);

    // PUT a Jira issue returns 204 No Content on success
    await jiraClient.put(`/rest/api/3/issue/${input.issueKey}`, payload);

    const output: UpdateIssueOutput = {
      key: input.issueKey,
      updated: true,
      changedFields,
      url: `https://${jiraClient.config.host}/browse/${input.issueKey}`,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(output),
        },
      ],
    };
  };
}

// ── MCP Registration ────────────────────────────────────────────────────────

/**
 * Registra la tool "update_issue" en el MCP Server.
 */
export function registerUpdateIssue(server: McpServer, jiraClient: JiraClient): void {
  const handler = createUpdateIssueHandler(jiraClient);

  server.tool(
    'update_issue',
    'Update editable fields of an existing issue. You can modify: summary, description, priority, labels, components, and custom fields. To change the issue status, use transition_issue instead. At least one field besides issueKey must be provided. Labels and components completely replace existing values.',
    updateIssueShape,
    handler,
  );
}
