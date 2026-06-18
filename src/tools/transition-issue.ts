import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

const transitionIssueShape = {
  issueKey: z.string().min(1).describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
  transitionName: z
    .string()
    .min(1)
    .optional()
    .describe('Human-readable transition name (e.g., "In Progress", "Done", "Start Progress").'),
  transitionId: z
    .string()
    .min(1)
    .optional()
    .describe('Numeric transition ID. Use if transition name is ambiguous or not found.'),
  resolution: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Resolution name. Required for some transitions (e.g., "Done", "Fixed", "Won\'t Fix").',
    ),
  comment: z.string().min(1).optional().describe('Optional comment to add during the transition.'),
  listTransitions: z
    .boolean()
    .default(false)
    .describe('If true, only lists available transitions without executing one.'),
};

/**
 * Schema de entrada para la tool "transition_issue".
 * Validación: se requiere transitionName, transitionId, o listTransitions=true.
 */
export const TransitionIssueInputSchema = z
  .object(transitionIssueShape)
  .strict()
  .refine(
    (data) =>
      data.listTransitions || data.transitionName !== undefined || data.transitionId !== undefined,
    {
      message: 'Either transitionName, transitionId, or listTransitions=true must be provided.',
    },
  );

export type TransitionIssueInput = z.infer<typeof TransitionIssueInputSchema>;

// ── Raw types from Jira API ─────────────────────────────────────────────────

interface JiraTransitionRaw {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
    statusCategory?: { name?: string };
  };
}

interface JiraTransitionsRawResponse {
  transitions: JiraTransitionRaw[];
}

// ── Helper types ────────────────────────────────────────────────────────────

interface AvailableTransition {
  id: string;
  name: string;
  toStatus: string;
}

interface TransitionOutput {
  key: string;
  transitioned: boolean;
  fromStatus?: string;
  toStatus?: string;
  url: string;
  availableTransitions?: AvailableTransition[];
}

// ── Transition resolver ─────────────────────────────────────────────────────

function mapTransitions(raw: JiraTransitionRaw[]): AvailableTransition[] {
  return raw.map((t) => ({
    id: t.id,
    name: t.name,
    toStatus: t.to.name,
  }));
}

async function getAvailableTransitions(
  jiraClient: JiraClient,
  issueKey: string,
): Promise<JiraTransitionsRawResponse> {
  const response = await jiraClient.get<JiraTransitionsRawResponse>(
    `/rest/api/3/issue/${issueKey}/transitions`,
  );
  return response.data;
}

async function resolveTransitionId(
  jiraClient: JiraClient,
  issueKey: string,
  transitionName: string,
): Promise<AvailableTransition | null> {
  const raw = await getAvailableTransitions(jiraClient, issueKey);
  const transitions = mapTransitions(raw.transitions);

  const matches = transitions.filter(
    (t) =>
      t.name.toLowerCase() === transitionName.toLowerCase() ||
      t.toStatus.toLowerCase() === transitionName.toLowerCase(),
  );

  if (matches.length === 1) return matches[0] ?? null;
  return null; // None or ambiguous
}

// ── Handler factory ─────────────────────────────────────────────────────────

/**
 * Crea el handler para la tool "transition_issue".
 */
export function createTransitionIssueHandler(jiraClient: JiraClient) {
  return async (input: TransitionIssueInput) => {
    const host = jiraClient.config.host;
    const issueKey = input.issueKey;

    // --- Mode: list available transitions ---
    if (input.listTransitions) {
      const raw = await getAvailableTransitions(jiraClient, issueKey);
      const available = mapTransitions(raw.transitions);

      const output: TransitionOutput = {
        key: issueKey,
        transitioned: false,
        url: `https://${host}/browse/${issueKey}`,
        availableTransitions: available,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    }

    // --- Mode: execute transition ---
    let transitionId = input.transitionId;

    // Resolve by name if needed
    if (!transitionId && input.transitionName) {
      const resolved = await resolveTransitionId(jiraClient, issueKey, input.transitionName);

      if (!resolved) {
        // Get all available transitions for the error message
        const raw = await getAvailableTransitions(jiraClient, issueKey);
        const available = mapTransitions(raw.transitions);

        const output: TransitionOutput = {
          key: issueKey,
          transitioned: false,
          url: `https://${host}/browse/${issueKey}`,
          availableTransitions: available,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ...output,
                error: `Transition "${input.transitionName}" not found. Check availableTransitions.`,
              }),
            },
          ],
          isError: true,
        };
      }

      transitionId = resolved.id;
    }

    if (!transitionId) {
      throw new Error('No transitionId resolved. This should not happen due to Zod validation.');
    }

    // Build transition payload
    const payload: Record<string, unknown> = {
      transition: { id: transitionId },
    };

    // Add resolution if provided
    if (input.resolution) {
      payload.fields = { resolution: { name: input.resolution } };
    }

    // Add comment if provided
    if (input.comment) {
      payload.update = {
        comment: [
          {
            add: {
              body: input.comment,
            },
          },
        ],
      };
    }

    await jiraClient.post(`/rest/api/3/issue/${issueKey}/transitions`, payload);

    const output: TransitionOutput = {
      key: issueKey,
      transitioned: true,
      url: `https://${host}/browse/${issueKey}`,
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    };
  };
}

// ── MCP Registration ────────────────────────────────────────────────────────

/**
 * Registra la tool "transition_issue" en el MCP Server.
 */
export function registerTransitionIssue(server: McpServer, jiraClient: JiraClient): void {
  const handler = createTransitionIssueHandler(jiraClient);

  server.tool(
    'transition_issue',
    'Transition an issue through its workflow. You can either execute a transition by name or ID, or list all available transitions from the current state. Some transitions require a resolution (e.g., "Done" may require "Fixed", "Won\'t Fix", etc.). Use listTransitions=true to discover what transitions are available before attempting one.',
    transitionIssueShape,
    handler,
  );
}
