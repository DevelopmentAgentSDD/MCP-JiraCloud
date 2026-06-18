import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Schema de entrada para la tool "search_issues".
 */
export const SearchIssuesInputSchema = z
  .object({
    jql: z
      .string()
      .optional()
      .describe('Raw JQL query string. If provided, all other filter parameters are ignored.'),
    projectKey: z
      .string()
      .min(1)
      .optional()
      .describe('Project key (e.g., "PROJ"). Filters issues by project.'),
    issueType: z
      .enum(['Task', 'Bug', 'Story', 'Epic', 'Subtask'])
      .optional()
      .describe('Filter by issue type.'),
    status: z
      .string()
      .min(1)
      .optional()
      .describe('Filter by status name (e.g., "In Progress", "Done").'),
    assignee: z
      .string()
      .optional()
      .describe('Filter by assignee. Use account ID, "currentUser()", or "unassigned".'),
    priority: z
      .enum(['Highest', 'High', 'Medium', 'Low', 'Lowest'])
      .optional()
      .describe('Filter by priority level.'),
    labels: z
      .array(z.string().min(1))
      .optional()
      .describe('Filter by labels (issues must have ALL specified labels).'),
    sprint: z.string().min(1).optional().describe('Filter by sprint name or ID.'),
    text: z
      .string()
      .min(1)
      .optional()
      .describe('Free-text search in summary and description fields.'),
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
      .min(1)
      .optional()
      .describe('Sort field and direction (e.g., "created DESC", "priority ASC").'),
    fields: z
      .array(z.string().min(1))
      .optional()
      .describe(
        'Specific fields to include in response (e.g., ["summary", "status", "assignee"]). If omitted, returns default issue view.',
      ),
  })
  .strict();

export type SearchIssuesInput = z.infer<typeof SearchIssuesInputSchema>;

// ── Raw types from Jira API ─────────────────────────────────────────────────

interface JiraSearchRawIssue {
  id: string;
  key: string;
  fields: {
    summary?: string;
    issuetype?: { name?: string };
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: { displayName?: string; accountId?: string } | null;
    created?: string;
    updated?: string;
    labels?: string[];
  };
}

interface JiraSearchRawResponse {
  total: number;
  startAt: number;
  maxResults: number;
  issues: JiraSearchRawIssue[];
}

// ── JQL Builder ─────────────────────────────────────────────────────────────

/**
 * Escapes special characters in a JQL string value.
 * Prevents JQL injection when interpolating user-supplied values into queries.
 *
 * Characters escaped:
 *   - Backslash `\` → `\\`
 *   - Double quote `"` → `\"`
 *   - Single quote `'` → `\'`
 *
 * The returned value is wrapped in double quotes for use in JQL clauses.
 */
function escapeJqlString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
  return `"${escaped}"`;
}

/**
 * Construye una query JQL a partir de los parámetros estructurados.
 */
function buildJql(input: SearchIssuesInput): string {
  if (input.jql) return input.jql;

  const clauses: string[] = [];

  if (input.projectKey) clauses.push(`project = ${escapeJqlString(input.projectKey)}`);
  if (input.issueType) clauses.push(`issuetype = ${escapeJqlString(input.issueType)}`);
  if (input.status) clauses.push(`status = ${escapeJqlString(input.status)}`);

  if (input.assignee) {
    if (input.assignee === 'unassigned') {
      clauses.push('assignee = EMPTY');
    } else if (input.assignee === 'currentUser()') {
      clauses.push('assignee = currentUser()');
    } else {
      clauses.push(`assignee = ${escapeJqlString(input.assignee)}`);
    }
  }

  if (input.priority) clauses.push(`priority = ${escapeJqlString(input.priority)}`);

  if (input.labels && input.labels.length > 0) {
    for (const label of input.labels) {
      clauses.push(`labels = ${escapeJqlString(label)}`);
    }
  }

  if (input.sprint) clauses.push(`sprint = ${escapeJqlString(input.sprint)}`);
  if (input.text) clauses.push(`text ~ ${escapeJqlString(input.text)}`);

  let jql = clauses.join(' AND ') || 'created >= -30d';

  if (input.orderBy) jql += ` ORDER BY ${input.orderBy}`;

  return jql;
}

// ── Response mapper ─────────────────────────────────────────────────────────

interface SearchIssuesOutputIssue {
  key: string;
  id: string;
  summary: string;
  issueType: string;
  status: string;
  priority?: string;
  assignee?: string;
  created: string;
  updated: string;
  url: string;
}

interface SearchIssuesOutput {
  total: number;
  startAt: number;
  maxResults: number;
  issues: SearchIssuesOutputIssue[];
}

function mapSearchResponse(raw: JiraSearchRawResponse, host: string): SearchIssuesOutput {
  return {
    total: raw.total,
    startAt: raw.startAt,
    maxResults: raw.maxResults,
    issues: raw.issues.map((issue) => ({
      key: issue.key,
      id: issue.id,
      summary: issue.fields.summary ?? '',
      issueType: issue.fields.issuetype?.name ?? '',
      status: issue.fields.status?.name ?? '',
      priority: issue.fields.priority?.name,
      assignee: issue.fields.assignee?.displayName ?? undefined,
      created: issue.fields.created ?? '',
      updated: issue.fields.updated ?? '',
      url: `https://${host}/browse/${issue.key}`,
    })),
  };
}

// ── Handler factory ─────────────────────────────────────────────────────────

/**
 * Crea el handler para la tool "search_issues".
 */
export function createSearchIssuesHandler(jiraClient: JiraClient) {
  return async (input: SearchIssuesInput) => {
    const jql = buildJql(input);

    const body: Record<string, unknown> = {
      jql,
      startAt: input.startAt,
      maxResults: input.maxResults,
    };

    if (input.fields && input.fields.length > 0) {
      body.fields = input.fields;
    }

    const response = await jiraClient.post<JiraSearchRawResponse>('/rest/api/3/search', body);

    const output = mapSearchResponse(response.data, jiraClient.config.host);

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
 * Registra la tool "search_issues" en el MCP Server.
 */
export function registerSearchIssues(server: McpServer, jiraClient: JiraClient): void {
  const handler = createSearchIssuesHandler(jiraClient);

  server.tool(
    'search_issues',
    'Search for issues in Jira using JQL (Jira Query Language). Supports filtering by project, type, status, assignee, priority, labels, sprint, and free-text search. Results are paginated. By default returns the first 50 matching issues. Use this to find existing issues before creating duplicates.',
    SearchIssuesInputSchema.shape,
    handler,
  );
}
