import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

const getSprintsShape = {
  boardId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Numeric board ID (e.g., 42). Alternative to boardName.'),
  boardName: z
    .string()
    .min(1)
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
  maxResults: z.number().int().min(1).max(50).default(50).describe('Max sprints to return.'),
};

/**
 * Schema de entrada para la tool "get_sprints".
 * Validación: se requiere boardId o boardName (al menos uno).
 */
export const GetSprintsInputSchema = z
  .object(getSprintsShape)
  .strict()
  .refine((data) => data.boardId !== undefined || data.boardName !== undefined, {
    message: 'Either boardId or boardName must be provided.',
  });

export type GetSprintsInput = z.infer<typeof GetSprintsInputSchema>;

// ── Raw types from Jira Agile API ───────────────────────────────────────────

interface JiraBoardRaw {
  id: number;
  name: string;
}

interface JiraBoardsRawResponse {
  values: JiraBoardRaw[];
}

interface JiraSprintRaw {
  id: number;
  name: string;
  state: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
}

interface JiraSprintsRawResponse {
  values: JiraSprintRaw[];
  total?: number;
}

interface JiraSprintIssueRaw {
  key: string;
  fields: {
    summary?: string;
    issuetype?: { name?: string };
    status?: { name?: string };
    assignee?: { displayName?: string } | null;
  };
}

interface JiraSprintIssuesRawResponse {
  issues: JiraSprintIssueRaw[];
}

// ── Helper types ────────────────────────────────────────────────────────────

interface SprintIssue {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  assignee?: string;
}

interface SprintOutput {
  id: number;
  name: string;
  state: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  issueCount: number;
  issues?: SprintIssue[];
}

interface GetSprintsOutput {
  boardId: number;
  boardName: string;
  total: number;
  sprints: SprintOutput[];
}

// ── Board resolution ────────────────────────────────────────────────────────

async function resolveBoardId(
  jiraClient: JiraClient,
  boardName: string,
): Promise<{ id: number; name: string } | null> {
  const response = await jiraClient.get<JiraBoardsRawResponse>(
    '/rest/agile/1.0/board',
    { name: boardName },
    { useAgileApi: true },
  );

  const boards = response.data.values;
  if (boards.length === 0) return null;

  const exact = boards.find((b) => b.name.toLowerCase() === boardName.toLowerCase());
  return exact ? { id: exact.id, name: exact.name } : { id: boards[0]!.id, name: boards[0]!.name };
}

// ── Sprint issues fetcher ───────────────────────────────────────────────────

async function fetchSprintIssues(jiraClient: JiraClient, sprintId: number): Promise<SprintIssue[]> {
  const response = await jiraClient.get<JiraSprintIssuesRawResponse>(
    `/rest/agile/1.0/sprint/${sprintId}/issue`,
    undefined,
    { useAgileApi: true },
  );

  return response.data.issues.map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary ?? '',
    issueType: issue.fields.issuetype?.name ?? '',
    status: issue.fields.status?.name ?? '',
    assignee: issue.fields.assignee?.displayName ?? undefined,
  }));
}

// ── Mapper ──────────────────────────────────────────────────────────────────

function countSprintIssues(_sprint: JiraSprintRaw): number {
  // Initial count is 0; updated when includeIssues fetches actual issues
  return 0;
}

function mapSprint(raw: JiraSprintRaw): SprintOutput {
  return {
    id: raw.id,
    name: raw.name,
    state: raw.state,
    goal: raw.goal,
    startDate: raw.startDate,
    endDate: raw.endDate,
    issueCount: countSprintIssues(raw),
  };
}

// ── Handler factory ─────────────────────────────────────────────────────────

/**
 * Crea el handler para la tool "get_sprints".
 */
export function createGetSprintsHandler(jiraClient: JiraClient) {
  return async (input: GetSprintsInput) => {
    // Resolve board ID
    let boardId: number;
    let boardName: string;

    if (input.boardId !== undefined) {
      boardId = input.boardId;
      boardName = input.boardName ?? `Board ${input.boardId}`;
    } else if (input.boardName) {
      const resolved = await resolveBoardId(jiraClient, input.boardName);
      if (!resolved) {
        // Return error result instead of throwing
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                boardId: 0,
                boardName: input.boardName,
                total: 0,
                sprints: [],
                error: `Board "${input.boardName}" not found. Verify the board name.`,
              }),
            },
          ],
          isError: true,
        };
      }
      boardId = resolved.id;
      boardName = resolved.name;
    } else {
      throw new Error(
        'No boardId or boardName provided. This should not happen due to Zod validation.',
      );
    }

    // Fetch sprints
    const sprintsResponse = await jiraClient.get<JiraSprintsRawResponse>(
      `/rest/agile/1.0/board/${boardId}/sprint`,
      {
        state: input.state,
        startAt: input.startAt,
        maxResults: input.maxResults,
      },
      { useAgileApi: true },
    );

    const rawSprints = sprintsResponse.data.values;
    const mappedSprints = rawSprints.map(mapSprint);

    // Optionally include issues
    if (input.includeIssues) {
      for (const sprint of mappedSprints) {
        try {
          sprint.issues = await fetchSprintIssues(jiraClient, sprint.id);
          sprint.issueCount = sprint.issues.length;
        } catch {
          // If issue fetch fails, leave issueCount from the sprint data
          sprint.issues = [];
        }
      }
    }

    const output: GetSprintsOutput = {
      boardId,
      boardName,
      total: sprintsResponse.data.total ?? mappedSprints.length,
      sprints: mappedSprints,
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
 * Registra la tool "get_sprints" en el MCP Server.
 */
export function registerGetSprints(server: McpServer, jiraClient: JiraClient): void {
  const handler = createGetSprintsHandler(jiraClient);

  server.tool(
    'get_sprints',
    'Get sprints from a Jira board. You can specify a boardId directly or provide a boardName to look it up. Filter sprints by state: active, future, or closed. Optionally include the issues within each sprint. Use this to see what work is planned or in progress for a team.',
    getSprintsShape,
    handler,
  );
}
