import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

const createIssueShape = {
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
    .describe('Issue description. Supports Jira markdown and Atlassian Document Format (ADF).'),
  priority: z
    .enum(['Highest', 'High', 'Medium', 'Low', 'Lowest'])
    .optional()
    .describe('Priority level. Default: project default.'),
  assignee: z
    .string()
    .min(1)
    .optional()
    .describe('Account ID of the user to assign. Omit for automatic assignment.'),
  labels: z.array(z.string().min(1)).optional().describe('Labels to apply to the issue.'),
  components: z
    .array(z.string().min(1))
    .optional()
    .describe('Component names to associate with the issue.'),
  sprint: z.string().min(1).optional().describe('Sprint name or ID to add the issue to.'),
  parentKey: z
    .string()
    .min(1)
    .optional()
    .describe('Parent issue key. REQUIRED when issueType is "Subtask".'),
  epicLink: z
    .string()
    .min(1)
    .optional()
    .describe('Epic issue key to link (e.g., "PROJ-10"). For Story, Task, Bug types.'),
  epicName: z.string().min(1).optional().describe('Epic name. REQUIRED when issueType is "Epic".'),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .optional()
    .describe('Due date in YYYY-MM-DD format.'),
  storyPoints: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Story point estimate (0–100).'),
  customFields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Map of custom field IDs to values. Keys must be like "customfield_10014".'),
};

/**
 * Schema de entrada para la tool "create_issue".
 * Validación cruzada:
 *  - Si issueType es "Subtask", parentKey es obligatorio.
 *  - Si issueType es "Epic", epicName es obligatorio.
 */
export const CreateIssueInputSchema = z
  .object(createIssueShape)
  .strict()
  .refine((data) => data.issueType !== 'Subtask' || data.parentKey !== undefined, {
    message: 'parentKey is required when issueType is "Subtask".',
    path: ['parentKey'],
  })
  .refine((data) => data.issueType !== 'Epic' || data.epicName !== undefined, {
    message: 'epicName is required when issueType is "Epic".',
    path: ['epicName'],
  });

export type CreateIssueInput = z.infer<typeof CreateIssueInputSchema>;

// ── Raw types from Jira API ─────────────────────────────────────────────────

interface JiraCreateIssueRawResponse {
  id: string;
  key: string;
  self: string;
  fields?: {
    summary?: string;
    issuetype?: { name?: string };
    status?: { name?: string };
  };
}

// ── Response mapper ─────────────────────────────────────────────────────────

interface CreateIssueOutput {
  key: string;
  id: string;
  url: string;
  summary: string;
  issueType: string;
  status: string;
}

function mapCreateResponse(
  raw: JiraCreateIssueRawResponse,
  input: CreateIssueInput,
  host: string,
): CreateIssueOutput {
  return {
    key: raw.key,
    id: raw.id,
    url: `https://${host}/browse/${raw.key}`,
    summary: input.summary,
    issueType: input.issueType,
    status: raw.fields?.status?.name ?? 'To Do',
  };
}

// ── Payload builder ─────────────────────────────────────────────────────────

function buildCreatePayload(input: CreateIssueInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    summary: input.summary,
    issuetype: { name: input.issueType },
  };

  if (input.description) fields.description = input.description;
  if (input.priority) fields.priority = { name: input.priority };
  if (input.assignee) fields.assignee = { id: input.assignee };
  if (input.labels) fields.labels = input.labels;
  if (input.components) fields.components = input.components.map((c) => ({ name: c }));
  if (input.parentKey) fields.parent = { key: input.parentKey };
  if (input.epicLink) fields.customfield_10014 = input.epicLink;
  if (input.epicName) fields.customfield_10011 = input.epicName;
  if (input.dueDate) fields.duedate = input.dueDate;
  if (input.storyPoints !== undefined) fields.customfield_10016 = input.storyPoints;
  if (input.sprint) fields.customfield_10020 = input.sprint;
  if (input.customFields) Object.assign(fields, input.customFields);

  return { fields };
}

// ── Handler factory ─────────────────────────────────────────────────────────

/**
 * Crea el handler para la tool "create_issue".
 */
export function createCreateIssueHandler(jiraClient: JiraClient) {
  return async (input: CreateIssueInput) => {
    const payload = buildCreatePayload(input);

    const response = await jiraClient.post<JiraCreateIssueRawResponse>(
      '/rest/api/3/issue',
      payload,
    );

    const output = mapCreateResponse(response.data, input, jiraClient.config.host);

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
 * Registra la tool "create_issue" en el MCP Server.
 */
export function registerCreateIssue(server: McpServer, jiraClient: JiraClient): void {
  const handler = createCreateIssueHandler(jiraClient);

  server.tool(
    'create_issue',
    'Create a new issue in Jira. Requires at minimum: projectKey, summary, and issueType. Optionally accepts description, priority, assignee, labels, components, sprint assignment, parent issue (for subtasks), epic link, and custom fields. Returns the created issue key, ID, and URL. Before creating, consider using search_issues to check for potential duplicates.',
    createIssueShape,
    handler,
  );
}
