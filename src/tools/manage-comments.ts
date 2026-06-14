import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';

/**
 * Schema de entrada para la tool "manage_comments".
 * Usa discriminatedUnion en el campo "action" para validar según la acción.
 */
export const ManageCommentsInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('list'),
      issueKey: z.string().min(1).describe('Issue key. REQUIRED.'),
      startAt: z.number().int().min(0).default(0).describe('Pagination offset.'),
      maxResults: z.number().int().min(1).max(100).default(50).describe('Max comments to return.'),
    })
    .strict(),
  z
    .object({
      action: z.literal('add'),
      issueKey: z.string().min(1).describe('Issue key. REQUIRED.'),
      body: z.string().min(1).describe('Comment text. Supports Jira markdown. REQUIRED.'),
    })
    .strict(),
]);

export type ManageCommentsInput = z.infer<typeof ManageCommentsInputSchema>;

// ── Raw types from Jira API ─────────────────────────────────────────────────

interface JiraCommentRawAuthor {
  displayName?: string;
  accountId?: string;
}

interface JiraCommentRaw {
  id: string;
  author?: JiraCommentRawAuthor;
  body?: unknown; // Can be ADF or string
  created?: string;
  updated?: string;
}

interface JiraCommentsListRawResponse {
  comments: JiraCommentRaw[];
  total?: number;
  startAt?: number;
  maxResults?: number;
}

interface JiraCommentAddRawResponse {
  id: string;
  author?: JiraCommentRawAuthor;
  body?: unknown;
  created?: string;
}

// ── ADF helpers ─────────────────────────────────────────────────────────────

/**
 * Convierte texto plano al Atlassian Document Format (ADF) requerido por Jira Cloud v3.
 */
function plainTextToAdf(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text,
          },
        ],
      },
    ],
  };
}

/**
 * Extrae texto legible de un body de comentario de Jira (puede ser ADF o string plano).
 */
function extractCommentBody(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const adf = body as Record<string, unknown>;
    // Try to extract text from ADF: doc -> content[0] -> content[0] -> text
    if (adf.type === 'doc' && Array.isArray(adf.content)) {
      const paragraphs: string[] = [];
      for (const block of adf.content) {
        if (
          block &&
          typeof block === 'object' &&
          (block as Record<string, unknown>).type === 'paragraph'
        ) {
          const paragraph = block as Record<string, unknown>;
          if (Array.isArray(paragraph.content)) {
            const texts: string[] = [];
            for (const inline of paragraph.content) {
              if (
                inline &&
                typeof inline === 'object' &&
                (inline as Record<string, unknown>).text
              ) {
                texts.push(String((inline as Record<string, unknown>).text));
              }
            }
            paragraphs.push(texts.join(''));
          }
        }
      }
      return paragraphs.join('\n');
    }
    // Fallback: return JSON representation
    return JSON.stringify(body);
  }
  return '';
}

// ── Handler factory ─────────────────────────────────────────────────────────

interface CommentOutput {
  id: string;
  author: string;
  body: string;
  created: string;
  updated: string;
}

interface CommentsListOutput {
  issueKey: string;
  total: number;
  startAt: number;
  maxResults: number;
  comments: CommentOutput[];
}

interface CommentAddOutput {
  issueKey: string;
  commentId: string;
  author: string;
  body: string;
  created: string;
  url: string;
}

/**
 * Crea el handler para la tool "manage_comments".
 */
export function createManageCommentsHandler(jiraClient: JiraClient) {
  return async (
    input: ManageCommentsInput,
  ): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> => {
    const host = jiraClient.config.host;

    if (input.action === 'list') {
      const response = await jiraClient.get<JiraCommentsListRawResponse>(
        `/rest/api/3/issue/${input.issueKey}/comment`,
        {
          startAt: input.startAt,
          maxResults: input.maxResults,
        },
      );

      const raw = response.data;
      const output: CommentsListOutput = {
        issueKey: input.issueKey,
        total: raw.total ?? raw.comments.length,
        startAt: raw.startAt ?? input.startAt,
        maxResults: raw.maxResults ?? input.maxResults,
        comments: raw.comments.map((c) => ({
          id: c.id,
          author: c.author?.displayName ?? 'Unknown',
          body: extractCommentBody(c.body),
          created: c.created ?? '',
          updated: c.updated ?? '',
        })),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    }

    // action === 'add'
    const adfBody = plainTextToAdf(input.body);

    const response = await jiraClient.post<JiraCommentAddRawResponse>(
      `/rest/api/3/issue/${input.issueKey}/comment`,
      { body: adfBody },
    );

    const raw = response.data;
    const output: CommentAddOutput = {
      issueKey: input.issueKey,
      commentId: raw.id,
      author: raw.author?.displayName ?? 'Unknown',
      body: input.body,
      created: raw.created ?? new Date().toISOString(),
      url: `https://${host}/browse/${input.issueKey}#comment-${raw.id}`,
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    };
  };
}

// ── MCP Registration ────────────────────────────────────────────────────────

/**
 * Registra la tool "manage_comments" en el MCP Server.
 */
export function registerManageComments(server: McpServer, jiraClient: JiraClient): void {
  const handler = createManageCommentsHandler(jiraClient);

  server.tool(
    'manage_comments',
    'Manage comments on a Jira issue. Use action "list" to read all comments, or action "add" to create a new comment. Comments support Jira markdown syntax including @mentions. When adding, the body field is required. The list action supports pagination.',
    // Flat shape covering both branches for server.tool Zod validation
    {
      action: z
        .enum(['list', 'add'])
        .describe('Action to perform: "list" to read comments or "add" to create a new comment.'),
      issueKey: z.string().min(1).describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
      body: z
        .string()
        .min(1)
        .optional()
        .describe('Comment text. Supports Jira markdown. REQUIRED when action is "add".'),
      startAt: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Pagination offset (for "list" action).'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe('Max comments to return (for "list" action).'),
    },
    // The SDK passes validated args; we cast to the discriminated union type
    handler as (input: Record<string, unknown>) => ReturnType<typeof handler>,
  );
}
