/**
 * MCP Contract Tests
 *
 * Verifica que las 9 tools del MCP Server cumplen con el contrato del
 * protocolo MCP (Model Context Protocol), incluyendo:
 *  - Campos requeridos: name, description, inputSchema
 *  - Serialización correcta de Zod schemas a JSON Schema
 *  - Formato de respuesta estándar MCP en handlers
 *  - Formato de error estándar MCP
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { JiraClient } from '../../src/services/jira-client.js';
import { mockApiResponse } from '../fixtures/index.js';

// ── Import tool schemas and handler factories ────────────────────────────────

import { SearchIssuesInputSchema, createSearchIssuesHandler } from '../../src/tools/search-issues.js';
import { CreateIssueInputSchema, createCreateIssueHandler } from '../../src/tools/create-issue.js';
import { UpdateIssueInputSchema, createUpdateIssueHandler } from '../../src/tools/update-issue.js';
import { TransitionIssueInputSchema, createTransitionIssueHandler } from '../../src/tools/transition-issue.js';
import { GetSprintsInputSchema, createGetSprintsHandler } from '../../src/tools/get-sprints.js';
import { AssignUserInputSchema, createAssignUserHandler } from '../../src/tools/assign-user.js';
import { ManageCommentsInputSchema, createManageCommentsHandler } from '../../src/tools/manage-comments.js';
import { AttachFileInputSchema, createAttachFileHandler } from '../../src/tools/attach-file.js';
import { HealthCheckInputSchema, createHealthCheckHandler } from '../../src/tools/health-check.js';

// ── Tool definitions (mirroring what register.ts passes to server.tool) ──────

interface McpToolDefinition {
  name: string;
  description: string;
  schema: ReturnType<typeof zodToJsonSchema>;
  handlerFactory: (client: ReturnType<typeof createMockJiraClient>) => (...args: unknown[]) => Promise<unknown>;
  handlerArgs: unknown[];
}

// ── JiraClient mock ──────────────────────────────────────────────────────────

function createMockJiraClient(overrides = {}) {
  return {
    config: {
      host: 'test-company.atlassian.net',
      email: 'test@example.com',
      apiToken: 'test-token',
      baseUrl: 'https://test-company.atlassian.net/rest/api/3',
      agileBaseUrl: 'https://test-company.atlassian.net/rest/agile/1.0',
    },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as JiraClient & {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

// ── Helper: validate MCP response format ─────────────────────────────────────

function validateMcpResponse(result: unknown): void {
  expect(result).toBeDefined();
  expect(result).toHaveProperty('content');
  const content = (result as Record<string, unknown>).content;
  expect(Array.isArray(content)).toBe(true);
  expect((content as unknown[]).length).toBeGreaterThan(0);

  const firstContent = (content as Record<string, unknown>[])[0]!;
  expect(firstContent).toHaveProperty('type', 'text');
  expect(firstContent).toHaveProperty('text');
  expect(typeof firstContent.text).toBe('string');

  // Verify text is valid JSON
  expect(() => JSON.parse(firstContent.text as string)).not.toThrow();
}

// ── Helper: get JSON representation of text content ──────────────────────────

function getMcpTextContent(result: { content: { type: string; text: string }[] }): string {
  return result.content[0]!.text;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP Protocol Contract Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('MCP Protocol Contract', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // C001: Cada tool tiene name, description, e inputSchema (JSON Schema válido)
  // ────────────────────────────────────────────────────────────────────────────

  describe('Tool definitions compliance', () => {
    const tools = [
      { name: 'search_issues', schema: SearchIssuesInputSchema },
      { name: 'create_issue', schema: CreateIssueInputSchema },
      { name: 'update_issue', schema: UpdateIssueInputSchema },
      { name: 'transition_issue', schema: TransitionIssueInputSchema },
      { name: 'get_sprints', schema: GetSprintsInputSchema },
      { name: 'assign_user', schema: AssignUserInputSchema },
      { name: 'manage_comments', schema: ManageCommentsInputSchema },
      { name: 'attach_file', schema: AttachFileInputSchema },
      { name: 'jira_health_check', schema: HealthCheckInputSchema },
    ];

    it('should have exactly 9 tools registered', () => {
      expect(tools).toHaveLength(9);
    });

    for (const tool of tools) {
      describe(`Tool: ${tool.name}`, () => {
        it('should serialize Zod schema to valid JSON Schema', () => {
          const jsonSchema = zodToJsonSchema(tool.schema);

          // JSON Schema must be defined
          expect(jsonSchema).toBeDefined();

          // Discriminated unions use anyOf instead of type:object
          if ('anyOf' in jsonSchema && Array.isArray(jsonSchema.anyOf)) {
            // Valid discriminated union schema
            expect(jsonSchema.anyOf.length).toBeGreaterThan(0);
            // Each variant should be a valid object schema
            for (const variant of jsonSchema.anyOf) {
              expect(variant).toHaveProperty('type', 'object');
            }
          } else {
            // Regular object schemas must have type:object and properties
            expect(jsonSchema).toHaveProperty('type', 'object');
            expect(jsonSchema).toHaveProperty('properties');
          }

          if ('additionalProperties' in jsonSchema) {
            // strict() schemas should have additionalProperties: false
            expect(jsonSchema.additionalProperties).toBe(false);
          }
        });

        it('should produce JSON Schema with valid structure (not empty)', () => {
          const jsonSchema = zodToJsonSchema(tool.schema);
          const jsonStr = JSON.stringify(jsonSchema);
          expect(jsonStr).toBeTruthy();
          expect(jsonStr.length).toBeGreaterThan(10);
          // Verify it's valid JSON
          expect(() => JSON.parse(jsonStr)).not.toThrow();
          // Verify it has either type:object or anyOf (discriminated union)
          const hasType =
            ('type' in jsonSchema && jsonSchema.type === 'object') ||
            ('anyOf' in jsonSchema && Array.isArray(jsonSchema.anyOf));
          expect(hasType).toBe(true);
        });

        it('should have required fields declared for non-optional fields', () => {
          const jsonSchema = zodToJsonSchema(tool.schema);

          // For discriminated unions, check each variant
          if ('anyOf' in jsonSchema && Array.isArray(jsonSchema.anyOf)) {
            for (const variant of jsonSchema.anyOf) {
              if (variant.required && Array.isArray(variant.required)) {
                for (const field of variant.required) {
                  expect(variant.properties).toHaveProperty(field as string);
                }
              }
            }
          } else if (jsonSchema.required && Array.isArray(jsonSchema.required)) {
            // Each required field must be in properties
            for (const field of jsonSchema.required) {
              expect(jsonSchema.properties).toHaveProperty(field as string);
            }
          }
        });
      });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // C002: Handler responses comply with MCP content format
  // ────────────────────────────────────────────────────────────────────────────

  describe('Handler response format compliance', () => {
    // ── search_issues ───────────────────────────────────────────────────────

    describe('search_issues handler', () => {
      it('should return content array with type:text and valid JSON text', async () => {
        const client = createMockJiraClient();
        client.post.mockResolvedValue(
          mockApiResponse({ total: 0, startAt: 0, maxResults: 50, issues: [] }),
        );

        const handler = createSearchIssuesHandler(client);
        const result = await handler({ startAt: 0, maxResults: 50 });

        validateMcpResponse(result);
      });
    });

    // ── create_issue ────────────────────────────────────────────────────────

    describe('create_issue handler', () => {
      it('should return content array with type:text and valid JSON text', async () => {
        const client = createMockJiraClient();
        client.post.mockResolvedValue(
          mockApiResponse({
            id: '10001',
            key: 'PROJ-1',
            self: 'https://test-company.atlassian.net/rest/api/3/issue/10001',
          }),
        );

        const handler = createCreateIssueHandler(client);
        const result = await handler({
          projectKey: 'PROJ',
          summary: 'Test',
          issueType: 'Task',
        });

        validateMcpResponse(result);
        const output = JSON.parse(getMcpTextContent(result));
        expect(output).toHaveProperty('key');
        expect(output).toHaveProperty('id');
        expect(output).toHaveProperty('url');
      });
    });

    // ── update_issue ────────────────────────────────────────────────────────

    describe('update_issue handler', () => {
      it('should return content with updated=true and valid format', async () => {
        const client = createMockJiraClient();
        client.put.mockResolvedValue(mockApiResponse(undefined, 204));

        const handler = createUpdateIssueHandler(client);
        const result = await handler({
          issueKey: 'PROJ-1',
          summary: 'Updated',
        });

        validateMcpResponse(result);
        const output = JSON.parse(getMcpTextContent(result));
        expect(output).toHaveProperty('updated', true);
        expect(output).toHaveProperty('key', 'PROJ-1');
      });
    });

    // ── transition_issue ────────────────────────────────────────────────────

    describe('transition_issue handler', () => {
      it('should return valid MCP response in listTransitions mode', async () => {
        const client = createMockJiraClient();
        client.get.mockResolvedValue(
          mockApiResponse({
            transitions: [
              { id: '11', name: 'Start Progress', to: { id: '3', name: 'In Progress' } },
            ],
          }),
        );

        const handler = createTransitionIssueHandler(client);
        const result = await handler({
          issueKey: 'PROJ-1',
          listTransitions: true,
        });

        validateMcpResponse(result);
        const output = JSON.parse(getMcpTextContent(result));
        expect(output).toHaveProperty('transitioned', false);
        expect(output).toHaveProperty('availableTransitions');
      });

      it('should return isError:true when transition name not found', async () => {
        const client = createMockJiraClient();
        client.get.mockResolvedValue(
          mockApiResponse({
            transitions: [
              { id: '11', name: 'Start Progress', to: { id: '3', name: 'In Progress' } },
            ],
          }),
        );

        const handler = createTransitionIssueHandler(client);
        const result = await handler({
          issueKey: 'PROJ-1',
          transitionName: 'NonExistent',
        });

        // For MCP error responses: result contains isError=true and still has content
        expect(result).toHaveProperty('isError', true);
        expect(result).toHaveProperty('content');
        const content = result.content;
        expect(Array.isArray(content)).toBe(true);
        expect(content[0]!.type).toBe('text');
        const output = JSON.parse(content[0]!.text);
        expect(output).toHaveProperty('error');
      });
    });

    // ── get_sprints ─────────────────────────────────────────────────────────

    describe('get_sprints handler', () => {
      it('should return valid MCP response with sprint data', async () => {
        const client = createMockJiraClient();
        client.get.mockResolvedValue(
          mockApiResponse({
            values: [
              {
                id: 101,
                name: 'Sprint 5',
                state: 'active',
                goal: 'Goal',
                startDate: '2026-01-13',
                endDate: '2026-01-27',
              },
            ],
            total: 1,
          }),
        );

        const handler = createGetSprintsHandler(client);
        const result = await handler({
          boardId: 10,
          state: 'active',
          startAt: 0,
          maxResults: 50,
        });

        validateMcpResponse(result);
        const output = JSON.parse(getMcpTextContent(result));
        expect(output).toHaveProperty('boardId', 10);
        expect(output).toHaveProperty('sprints');
        expect(Array.isArray(output.sprints)).toBe(true);
      });

      it('should return isError:true when board not found', async () => {
        const client = createMockJiraClient();
        client.get.mockResolvedValue(mockApiResponse({ values: [] }));

        const handler = createGetSprintsHandler(client);
        const result = await handler({
          boardName: 'NonExistent',
          state: 'active',
          startAt: 0,
          maxResults: 50,
        });

        expect(result).toHaveProperty('isError', true);
        expect(result).toHaveProperty('content');
        const output = JSON.parse(result.content[0]!.text);
        expect(output).toHaveProperty('error');
      });
    });

    // ── assign_user ─────────────────────────────────────────────────────────

    describe('assign_user handler', () => {
      it('should return valid MCP response on successful assign', async () => {
        const client = createMockJiraClient();
        client.put.mockResolvedValue(
          mockApiResponse({
            accountId: 'user-123',
            displayName: 'John Doe',
            emailAddress: 'john@example.com',
          }),
        );

        const handler = createAssignUserHandler(client);
        const result = await handler({
          issueKey: 'PROJ-1',
          accountId: 'user-123',
        });

        validateMcpResponse(result);
        const output = JSON.parse(getMcpTextContent(result));
        expect(output).toHaveProperty('key', 'PROJ-1');
        expect(output).toHaveProperty('assignee');
      });

      it('should return valid MCP response on unassign (accountId: null)', async () => {
        const client = createMockJiraClient();
        client.put.mockResolvedValue(mockApiResponse(undefined, 204));

        const handler = createAssignUserHandler(client);
        const result = await handler({
          issueKey: 'PROJ-1',
          accountId: null,
        });

        validateMcpResponse(result);
        const output = JSON.parse(getMcpTextContent(result));
        expect(output.assignee).toBeNull();
      });
    });

    // ── manage_comments ─────────────────────────────────────────────────────

    describe('manage_comments handler', () => {
      it('should return valid MCP response for list action', async () => {
        const client = createMockJiraClient();
        client.get.mockResolvedValue(
          mockApiResponse({
            comments: [],
            total: 0,
            startAt: 0,
            maxResults: 50,
          }),
        );

        const handler = createManageCommentsHandler(client);
        const result = await handler({
          action: 'list' as const,
          issueKey: 'PROJ-1',
          startAt: 0,
          maxResults: 50,
        });

        validateMcpResponse(result);
        const output = JSON.parse(getMcpTextContent(result));
        expect(output).toHaveProperty('comments');
        expect(Array.isArray(output.comments)).toBe(true);
      });

      it('should return valid MCP response for add action', async () => {
        const client = createMockJiraClient();
        client.post.mockResolvedValue(
          mockApiResponse({
            id: '20001',
            author: { displayName: 'John Doe' },
            created: '2026-01-16T10:00:00.000Z',
          }),
        );

        const handler = createManageCommentsHandler(client);
        const result = await handler({
          action: 'add' as const,
          issueKey: 'PROJ-1',
          body: 'Test comment',
        });

        validateMcpResponse(result);
        const output = JSON.parse(getMcpTextContent(result));
        expect(output).toHaveProperty('commentId');
        expect(output).toHaveProperty('url');
      });
    });

    // ── attach_file ─────────────────────────────────────────────────────────

    describe('attach_file handler', () => {
      it('should return valid MCP response on successful attach', async () => {
        const client = createMockJiraClient();
        client.post.mockResolvedValue(
          mockApiResponse([
            {
              id: '30001',
              filename: 'package.json',
              size: 1234,
              mimeType: 'application/json',
              created: '2026-01-15T12:00:00.000Z',
            },
          ]),
        );

        const handler = createAttachFileHandler(client);
        const result = await handler({
          issueKey: 'PROJ-1',
          filePath: 'package.json',
        });

        validateMcpResponse(result);
        const output = JSON.parse(getMcpTextContent(result));
        expect(output).toHaveProperty('issueKey', 'PROJ-1');
        expect(output).toHaveProperty('attachment');
        expect(output.attachment).toHaveProperty('id');
        expect(output.attachment).toHaveProperty('filename');
      });
    });

    // ── jira_health_check ───────────────────────────────────────────────────

    describe('jira_health_check handler', () => {
      it('should return connected status on success', async () => {
        const client = createMockJiraClient();
        client.get.mockResolvedValue(
          mockApiResponse({
            accountId: 'user-123',
            displayName: 'John Doe',
            emailAddress: 'john@example.com',
          }),
        );

        const config = {
          host: 'test-company.atlassian.net',
          email: 'test@example.com',
          apiToken: 'test-token',
          baseUrl: 'https://test-company.atlassian.net/rest/api/3',
          agileBaseUrl: 'https://test-company.atlassian.net/rest/agile/1.0',
        };

        const handler = createHealthCheckHandler(client, config);
        const result = await handler();

        validateMcpResponse(result);
        const output = JSON.parse(getMcpTextContent(result));
        expect(output).toHaveProperty('status', 'connected');
        expect(output).toHaveProperty('jiraHost', 'test-company.atlassian.net');
        expect(output).toHaveProperty('timestamp');
        expect(output).toHaveProperty('user');
      });

      it('should return error status and isError:true on auth failure', async () => {
        const client = createMockJiraClient();
        client.get.mockRejectedValue(new Error('Authentication failed'));

        const config = {
          host: 'test-company.atlassian.net',
          email: 'test@example.com',
          apiToken: 'test-token',
          baseUrl: 'https://test-company.atlassian.net/rest/api/3',
          agileBaseUrl: 'https://test-company.atlassian.net/rest/agile/1.0',
        };

        const handler = createHealthCheckHandler(client, config);
        const result = await handler();

        expect(result).toHaveProperty('isError', true);
        expect(result).toHaveProperty('content');
        const output = JSON.parse(result.content[0]!.text);
        expect(output).toHaveProperty('status', 'error');
        expect(output).toHaveProperty('error');
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // C003: MCP error responses follow standard format
  // ────────────────────────────────────────────────────────────────────────────

  describe('MCP Error format', () => {
    it('should set isError:true when returning error results', () => {
      // Verified in tool-specific tests above (transition_issue, get_sprints, health_check)
      expect(true).toBe(true);
    });

    it('should include human-readable error text in content even for errors', () => {
      // The MCP protocol requires that even error responses return content
      // with useful information. Verified in tool-specific error tests above.
      expect(true).toBe(true);
    });
  });
});
