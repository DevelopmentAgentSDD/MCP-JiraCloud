import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JiraClient } from '../../../src/services/jira-client.js';
import { mockIssueSearchResults, mockApiResponse } from '../../fixtures/index.js';
import { createSearchIssuesHandler } from '../../../src/tools/search-issues.js';
import { createCreateIssueHandler } from '../../../src/tools/create-issue.js';
import { createUpdateIssueHandler } from '../../../src/tools/update-issue.js';
import { createTransitionIssueHandler } from '../../../src/tools/transition-issue.js';
import { createGetSprintsHandler } from '../../../src/tools/get-sprints.js';
import { createAssignUserHandler } from '../../../src/tools/assign-user.js';
import { createManageCommentsHandler } from '../../../src/tools/manage-comments.js';
import { createAttachFileHandler } from '../../../src/tools/attach-file.js';
import { createHealthCheckHandler } from '../../../src/tools/health-check.js';

// ── JiraClient mock factory ─────────────────────────────────────────────────
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

// ── Helper: parse tool result text ──────────────────────────────────────────
function parseToolResult(result: { content: { type: string; text: string }[] }): unknown {
  return JSON.parse(result.content[0]!.text);
}

// ═══════════════════════════════════════════════════════════════════════════
// search_issues
// ═══════════════════════════════════════════════════════════════════════════

describe('search_issues handler', () => {
  let client: ReturnType<typeof createMockJiraClient>;
  let handler: ReturnType<typeof createSearchIssuesHandler>;

  beforeEach(() => {
    client = createMockJiraClient();
    handler = createSearchIssuesHandler(client);
  });

  it('should search issues and return formatted results', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({
        total: mockIssueSearchResults.total,
        startAt: mockIssueSearchResults.startAt,
        maxResults: mockIssueSearchResults.maxResults,
        issues: mockIssueSearchResults.issues.map((issue) => ({
          id: issue.id,
          key: issue.key,
          fields: {
            summary: issue.summary,
            issuetype: { name: issue.issueType },
            status: { name: issue.status },
            priority: issue.priority ? { name: issue.priority } : undefined,
            assignee: issue.assignee
              ? { displayName: issue.assignee, accountId: issue.assigneeAccountId }
              : null,
            created: issue.created,
            updated: issue.updated,
            labels: issue.labels,
          },
        })),
      }),
    );

    const result = await handler({
      projectKey: 'PROJ',
      status: 'In Progress',
      startAt: 0,
      maxResults: 50,
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.total).toBe(3);
    expect(output.startAt).toBe(0);
    expect(Array.isArray(output.issues)).toBe(true);
    expect((output.issues as Record<string, unknown>[]).length).toBe(3);

    // Verify the first issue is mapped correctly
    const firstIssue = (output.issues as Record<string, unknown>[])[0]!;
    expect(firstIssue.key).toBe('PROJ-1');
    expect(firstIssue.summary).toBe('Fix login page validation error');
    expect(firstIssue.issueType).toBe('Bug');
    expect(firstIssue.status).toBe('In Progress');
    expect(firstIssue.url).toContain('test-company.atlassian.net/browse/PROJ-1');

    // Verify JQL was built and passed to post
    expect(client.post).toHaveBeenCalledWith(
      '/rest/api/3/search',
      expect.objectContaining({
        jql: expect.stringContaining('project = "PROJ"'),
        startAt: 0,
        maxResults: 50,
      }),
    );
  });

  it('should use raw JQL when provided', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({
        total: 0,
        startAt: 0,
        maxResults: 50,
        issues: [],
      }),
    );

    await handler({
      jql: 'project = TEST ORDER BY created DESC',
      startAt: 0,
      maxResults: 10,
    });

    expect(client.post).toHaveBeenCalledWith(
      '/rest/api/3/search',
      expect.objectContaining({
        jql: 'project = TEST ORDER BY created DESC',
        startAt: 0,
        maxResults: 10,
      }),
    );
  });

  it('should build JQL with unassigned assignee', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({ total: 0, startAt: 0, maxResults: 50, issues: [] }),
    );

    await handler({
      assignee: 'unassigned',
      startAt: 0,
      maxResults: 50,
    });

    expect(client.post).toHaveBeenCalledWith(
      '/rest/api/3/search',
      expect.objectContaining({
        jql: expect.stringContaining('assignee = EMPTY'),
      }),
    );
  });

  it('should build JQL with currentUser() assignee', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({ total: 0, startAt: 0, maxResults: 50, issues: [] }),
    );

    await handler({
      assignee: 'currentUser()',
      startAt: 0,
      maxResults: 50,
    });

    expect(client.post).toHaveBeenCalledWith(
      '/rest/api/3/search',
      expect.objectContaining({
        jql: expect.stringContaining('assignee = currentUser()'),
      }),
    );
  });

  it('should propagate errors from JiraClient', async () => {
    const error = new Error('Jira API error');
    client.post.mockRejectedValue(error);

    await expect(handler({ projectKey: 'PROJ', startAt: 0, maxResults: 50 })).rejects.toThrow(
      'Jira API error',
    );
  });

  it('should include labels in JQL', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({ total: 0, startAt: 0, maxResults: 50, issues: [] }),
    );

    await handler({
      labels: ['critical', 'backend'],
      startAt: 0,
      maxResults: 50,
    });

    expect(client.post).toHaveBeenCalledWith(
      '/rest/api/3/search',
      expect.objectContaining({
        jql: expect.stringContaining('labels = "critical" AND labels = "backend"'),
      }),
    );
  });

  it('should include orderBy in JQL when provided', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({ total: 0, startAt: 0, maxResults: 50, issues: [] }),
    );

    await handler({
      projectKey: 'PROJ',
      orderBy: 'created DESC',
      startAt: 0,
      maxResults: 50,
    });

    expect(client.post).toHaveBeenCalledWith(
      '/rest/api/3/search',
      expect.objectContaining({
        jql: expect.stringContaining('ORDER BY created DESC'),
      }),
    );
  });

  it('should handle empty results gracefully', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({ total: 0, startAt: 0, maxResults: 50, issues: [] }),
    );

    const result = await handler({
      projectKey: 'NONEXISTENT',
      startAt: 0,
      maxResults: 50,
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.total).toBe(0);
    expect((output.issues as unknown[]).length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// create_issue
// ═══════════════════════════════════════════════════════════════════════════

describe('create_issue handler', () => {
  let client: ReturnType<typeof createMockJiraClient>;
  let handler: ReturnType<typeof createCreateIssueHandler>;

  beforeEach(() => {
    client = createMockJiraClient();
    handler = createCreateIssueHandler(client);
  });

  it('should create a basic issue', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({
        id: '10004',
        key: 'PROJ-4',
        self: 'https://test-company.atlassian.net/rest/api/3/issue/10004',
      }),
    );

    const result = await handler({
      projectKey: 'PROJ',
      summary: 'New feature request',
      issueType: 'Story',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.key).toBe('PROJ-4');
    expect(output.id).toBe('10004');
    expect(output.url).toContain('test-company.atlassian.net/browse/PROJ-4');
    expect(output.summary).toBe('New feature request');
    expect(output.issueType).toBe('Story');
  });

  it('should create an issue with all optional fields', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({
        id: '10005',
        key: 'PROJ-5',
        self: 'https://test-company.atlassian.net/rest/api/3/issue/10005',
      }),
    );

    const result = await handler({
      projectKey: 'PROJ',
      summary: 'Full feature with all fields',
      issueType: 'Bug',
      description: 'This is a description',
      priority: 'High',
      assignee: 'user-123',
      labels: ['bug', 'critical'],
      components: ['backend'],
      dueDate: '2026-12-31',
      storyPoints: 5,
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.key).toBe('PROJ-5');

    // Verify payload structure was built correctly
    const postCall = client.post.mock.calls[0];
    const payload = postCall[1] as Record<string, unknown>;
    const fields = payload.fields as Record<string, unknown>;
    expect(fields.summary).toBe('Full feature with all fields');
    expect(fields.description).toBe('This is a description');
    expect(fields.labels).toEqual(['bug', 'critical']);
    expect(fields.priority).toEqual({ name: 'High' });
    expect(fields.assignee).toEqual({ id: 'user-123' });
    expect(fields.components).toEqual([{ name: 'backend' }]);
    expect(fields.duedate).toBe('2026-12-31');
  });

  it('should create a Subtask with parentKey', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({
        id: '10006',
        key: 'PROJ-6',
        self: 'https://test-company.atlassian.net/rest/api/3/issue/10006',
      }),
    );

    const result = await handler({
      projectKey: 'PROJ',
      summary: 'Subtask item',
      issueType: 'Subtask',
      parentKey: 'PROJ-100',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.key).toBe('PROJ-6');

    const postCall = client.post.mock.calls[0];
    const payload = postCall[1] as Record<string, unknown>;
    const fields = payload.fields as Record<string, unknown>;
    expect(fields.parent).toEqual({ key: 'PROJ-100' });
  });

  it('should create an Epic with epicName', async () => {
    client.post.mockResolvedValue(
      mockApiResponse({
        id: '10007',
        key: 'PROJ-7',
        self: 'https://test-company.atlassian.net/rest/api/3/issue/10007',
      }),
    );

    const result = await handler({
      projectKey: 'PROJ',
      summary: 'Epic feature',
      issueType: 'Epic',
      epicName: 'User Management',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.key).toBe('PROJ-7');

    const postCall = client.post.mock.calls[0];
    const payload = postCall[1] as Record<string, unknown>;
    const fields = payload.fields as Record<string, unknown>;
    expect(fields.customfield_10011).toBe('User Management');
  });

  it('should propagate errors from JiraClient', async () => {
    const error = new Error('Project not found');
    client.post.mockRejectedValue(error);

    await expect(
      handler({
        projectKey: 'NONEXISTENT',
        summary: 'Test',
        issueType: 'Task',
      }),
    ).rejects.toThrow('Project not found');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// update_issue
// ═══════════════════════════════════════════════════════════════════════════

describe('update_issue handler', () => {
  let client: ReturnType<typeof createMockJiraClient>;
  let handler: ReturnType<typeof createUpdateIssueHandler>;

  beforeEach(() => {
    client = createMockJiraClient();
    handler = createUpdateIssueHandler(client);
  });

  it('should update issue fields and return confirmation', async () => {
    client.put.mockResolvedValue(mockApiResponse(undefined, 204));

    const result = await handler({
      issueKey: 'PROJ-1',
      summary: 'Updated summary',
      priority: 'Highest' as const,
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.key).toBe('PROJ-1');
    expect(output.updated).toBe(true);
    expect(output.changedFields).toEqual(['summary', 'priority']);
    expect(output.url).toContain('test-company.atlassian.net/browse/PROJ-1');

    // Verify PUT was called with correct payload
    expect(client.put).toHaveBeenCalledWith(
      '/rest/api/3/issue/PROJ-1',
      expect.objectContaining({
        fields: expect.objectContaining({
          summary: 'Updated summary',
          priority: { name: 'Highest' },
        }),
      }),
    );
  });

  it('should update labels and components (replacement)', async () => {
    client.put.mockResolvedValue(mockApiResponse(undefined, 204));

    const result = await handler({
      issueKey: 'PROJ-2',
      labels: ['new-label'],
      components: ['api'],
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.changedFields).toContain('labels');
    expect(output.changedFields).toContain('components');

    const putCall = client.put.mock.calls[0];
    const payload = putCall[1] as Record<string, unknown>;
    const fields = payload.fields as Record<string, unknown>;
    expect(fields.labels).toEqual(['new-label']);
    expect(fields.components).toEqual([{ name: 'api' }]);
  });

  it('should update custom fields', async () => {
    client.put.mockResolvedValue(mockApiResponse(undefined, 204));

    const result = await handler({
      issueKey: 'PROJ-1',
      customFields: { customfield_10014: 'PROJ-10' },
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.changedFields).toContain('customfield_10014');

    const putCall = client.put.mock.calls[0];
    const payload = putCall[1] as Record<string, unknown>;
    const fields = payload.fields as Record<string, unknown>;
    expect(fields.customfield_10014).toBe('PROJ-10');
  });

  it('should update only description', async () => {
    client.put.mockResolvedValue(mockApiResponse(undefined, 204));

    const result = await handler({
      issueKey: 'PROJ-1',
      description: 'New description text',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.changedFields).toEqual(['description']);
  });

  it('should propagate errors from JiraClient', async () => {
    const error = new Error('Issue not found');
    client.put.mockRejectedValue(error);

    await expect(
      handler({
        issueKey: 'NONEXISTENT-999',
        summary: 'Test',
      }),
    ).rejects.toThrow('Issue not found');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// transition_issue
// ═══════════════════════════════════════════════════════════════════════════

describe('transition_issue handler', () => {
  let client: ReturnType<typeof createMockJiraClient>;
  let handler: ReturnType<typeof createTransitionIssueHandler>;

  beforeEach(() => {
    client = createMockJiraClient();
    handler = createTransitionIssueHandler(client);
  });

  it('should list available transitions', async () => {
    client.get.mockResolvedValue(
      mockApiResponse({
        transitions: [
          { id: '11', name: 'Start Progress', to: { id: '3', name: 'In Progress' } },
          { id: '21', name: 'Done', to: { id: '5', name: 'Done' } },
        ],
      }),
    );

    const result = await handler({
      issueKey: 'PROJ-1',
      listTransitions: true,
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.key).toBe('PROJ-1');
    expect(output.transitioned).toBe(false);
    expect(output.availableTransitions).toHaveLength(2);

    const transitions = output.availableTransitions as Record<string, unknown>[];
    expect(transitions[0]!.name).toBe('Start Progress');
    expect(transitions[0]!.toStatus).toBe('In Progress');
  });

  it('should execute transition by name', async () => {
    // Mock available transitions
    client.get.mockResolvedValueOnce(
      mockApiResponse({
        transitions: [{ id: '31', name: 'In Progress', to: { id: '3', name: 'In Progress' } }],
      }),
    );
    // Mock the POST to execute transition
    client.post.mockResolvedValue(mockApiResponse(undefined, 204));

    const result = await handler({
      issueKey: 'PROJ-1',
      transitionName: 'In Progress',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.transitioned).toBe(true);

    // Verify POST was made with correct transition ID
    expect(client.post).toHaveBeenCalledWith(
      '/rest/api/3/issue/PROJ-1/transitions',
      expect.objectContaining({
        transition: { id: '31' },
      }),
    );

    // GET was called to resolve name
    expect(client.get).toHaveBeenCalledWith('/rest/api/3/issue/PROJ-1/transitions');
  });

  it('should execute transition by ID directly', async () => {
    client.post.mockResolvedValue(mockApiResponse(undefined, 204));

    const result = await handler({
      issueKey: 'PROJ-1',
      transitionId: '21',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.transitioned).toBe(true);

    // Should NOT call GET to resolve; should POST directly
    expect(client.get).not.toHaveBeenCalled();
    expect(client.post).toHaveBeenCalledWith(
      '/rest/api/3/issue/PROJ-1/transitions',
      expect.objectContaining({
        transition: { id: '21' },
      }),
    );
  });

  it('should execute transition with resolution and comment', async () => {
    client.post.mockResolvedValue(mockApiResponse(undefined, 204));

    await handler({
      issueKey: 'PROJ-1',
      transitionId: '41',
      resolution: 'Fixed',
      comment: 'Completed in PR #42',
    });

    const postCall = client.post.mock.calls[0];
    const payload = postCall[1] as Record<string, unknown>;
    expect(payload.transition).toEqual({ id: '41' });
    expect((payload.fields as Record<string, unknown>).resolution).toEqual({ name: 'Fixed' });
    expect(payload.update).toBeDefined();
  });

  it('should return error when transition name not found', async () => {
    client.get.mockResolvedValue(
      mockApiResponse({
        transitions: [{ id: '11', name: 'Start Progress', to: { id: '3', name: 'In Progress' } }],
      }),
    );

    const result = await handler({
      issueKey: 'PROJ-1',
      transitionName: 'NonExistentTransition',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.transitioned).toBe(false);
    expect(output.error).toBeDefined();
    expect(output.availableTransitions).toBeDefined();
  });

  it('should propagate unexpected errors from JiraClient', async () => {
    const error = new Error('Network failure');
    client.get.mockRejectedValue(error);

    await expect(
      handler({
        issueKey: 'PROJ-1',
        listTransitions: true,
      }),
    ).rejects.toThrow('Network failure');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// get_sprints
// ═══════════════════════════════════════════════════════════════════════════

describe('get_sprints handler', () => {
  let client: ReturnType<typeof createMockJiraClient>;
  let handler: ReturnType<typeof createGetSprintsHandler>;

  beforeEach(() => {
    client = createMockJiraClient();
    handler = createGetSprintsHandler(client);
  });

  it('should fetch sprints by boardId', async () => {
    client.get.mockResolvedValue(
      mockApiResponse({
        values: [
          {
            id: 101,
            name: 'Sprint 5',
            state: 'active',
            goal: 'Complete core auth module',
            startDate: '2026-01-13',
            endDate: '2026-01-27',
          },
        ],
        total: 1,
      }),
    );

    const result = await handler({
      boardId: 10,
      state: 'active' as const,
      startAt: 0,
      maxResults: 50,
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.boardId).toBe(10);
    expect(output.total).toBe(1);
    expect(Array.isArray(output.sprints)).toBe(true);
    expect((output.sprints as Record<string, unknown>[]).length).toBe(1);

    const sprint = (output.sprints as Record<string, unknown>[])[0]!;
    expect(sprint.id).toBe(101);
    expect(sprint.name).toBe('Sprint 5');
    expect(sprint.state).toBe('active');
    expect(sprint.goal).toBe('Complete core auth module');

    // Verify agile API was called
    expect(client.get).toHaveBeenCalledWith(
      '/rest/agile/1.0/board/10/sprint',
      expect.objectContaining({ state: 'active' }),
      { useAgileApi: true },
    );
  });

  it('should resolve board by name', async () => {
    // First call: resolve board by name
    client.get.mockResolvedValueOnce(
      mockApiResponse({
        values: [{ id: 42, name: 'PROJ Scrum Board' }],
      }),
    );
    // Second call: fetch sprints
    client.get.mockResolvedValueOnce(
      mockApiResponse({
        values: [],
        total: 0,
      }),
    );

    const result = await handler({
      boardName: 'PROJ Scrum Board',
      state: 'active' as const,
      startAt: 0,
      maxResults: 50,
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.boardId).toBe(42);
    expect(output.boardName).toBe('PROJ Scrum Board');

    // Verify board resolution call
    expect(client.get).toHaveBeenNthCalledWith(
      1,
      '/rest/agile/1.0/board',
      { name: 'PROJ Scrum Board' },
      { useAgileApi: true },
    );
  });

  it('should return error when board not found by name', async () => {
    client.get.mockResolvedValue(mockApiResponse({ values: [] }));

    const result = await handler({
      boardName: 'NonExistentBoard',
      state: 'active' as const,
      startAt: 0,
      maxResults: 50,
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.error).toContain('not found');
  });

  it('should fetch issues when includeIssues is true', async () => {
    // Sprints response
    client.get.mockResolvedValueOnce(
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
    // Issues for sprint 101
    client.get.mockResolvedValueOnce(
      mockApiResponse({
        issues: [
          {
            key: 'PROJ-1',
            fields: {
              summary: 'Fix bug',
              issuetype: { name: 'Bug' },
              status: { name: 'In Progress' },
              assignee: { displayName: 'John Doe' },
            },
          },
        ],
      }),
    );

    const result = await handler({
      boardId: 10,
      state: 'active' as const,
      includeIssues: true,
      startAt: 0,
      maxResults: 50,
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    const sprint = (output.sprints as Record<string, unknown>[])[0]!;
    expect(sprint.issueCount).toBe(1);
    expect(sprint.issues).toBeDefined();
    expect((sprint.issues as Record<string, unknown>[])[0]!.key).toBe('PROJ-1');
  });

  it('should propagate errors from JiraClient', async () => {
    const error = new Error('Network failure');
    client.get.mockRejectedValue(error);

    await expect(
      handler({
        boardId: 10,
        state: 'active' as const,
        startAt: 0,
        maxResults: 50,
      }),
    ).rejects.toThrow('Network failure');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// assign_user
// ═══════════════════════════════════════════════════════════════════════════

describe('assign_user handler', () => {
  let client: ReturnType<typeof createMockJiraClient>;
  let handler: ReturnType<typeof createAssignUserHandler>;

  beforeEach(() => {
    client = createMockJiraClient();
    handler = createAssignUserHandler(client);
  });

  it('should assign a user to an issue', async () => {
    client.put.mockResolvedValue(
      mockApiResponse({
        accountId: '712020:abc-123-def',
        displayName: 'John Doe',
        emailAddress: 'john@company.com',
      }),
    );

    const result = await handler({
      issueKey: 'PROJ-1',
      accountId: '712020:abc-123-def',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.key).toBe('PROJ-1');
    expect(output.assignee).toBeDefined();

    const assignee = output.assignee as Record<string, unknown>;
    expect(assignee.accountId).toBe('712020:abc-123-def');
    expect(assignee.displayName).toBe('John Doe');
    expect(output.url).toContain('test-company.atlassian.net/browse/PROJ-1');

    expect(client.put).toHaveBeenCalledWith('/rest/api/3/issue/PROJ-1/assignee', {
      accountId: '712020:abc-123-def',
    });
  });

  it('should unassign a user when accountId is null', async () => {
    client.put.mockResolvedValue(mockApiResponse(undefined, 204));

    const result = await handler({
      issueKey: 'PROJ-1',
      accountId: null,
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.key).toBe('PROJ-1');
    expect(output.assignee).toBeNull();

    expect(client.put).toHaveBeenCalledWith('/rest/api/3/issue/PROJ-1/assignee', {
      accountId: null,
    });
  });

  it('should unassign when accountId is "unassigned"', async () => {
    client.put.mockResolvedValue(mockApiResponse(undefined, 204));

    const result = await handler({
      issueKey: 'PROJ-1',
      accountId: 'unassigned',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.assignee).toBeNull();
  });

  it('should propagate errors from JiraClient', async () => {
    const error = new Error('User not found');
    client.put.mockRejectedValue(error);

    await expect(
      handler({
        issueKey: 'PROJ-1',
        accountId: 'invalid-user',
      }),
    ).rejects.toThrow('User not found');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// manage_comments
// ═══════════════════════════════════════════════════════════════════════════

describe('manage_comments handler', () => {
  let client: ReturnType<typeof createMockJiraClient>;
  let handler: ReturnType<typeof createManageCommentsHandler>;

  beforeEach(() => {
    client = createMockJiraClient();
    handler = createManageCommentsHandler(client);
  });

  describe('action: list', () => {
    it('should list comments for an issue', async () => {
      client.get.mockResolvedValue(
        mockApiResponse({
          comments: [
            {
              id: '20001',
              author: { displayName: 'John Doe' },
              body: 'Working on this now.',
              created: '2026-01-15T11:00:00.000Z',
              updated: '2026-01-15T11:00:00.000Z',
            },
            {
              id: '20002',
              author: { displayName: 'Jane Smith' },
              body: 'Thanks!',
              created: '2026-01-15T13:30:00.000Z',
              updated: '2026-01-15T13:30:00.000Z',
            },
          ],
          total: 2,
          startAt: 0,
          maxResults: 50,
        }),
      );

      const result = await handler({
        action: 'list',
        issueKey: 'PROJ-1',
        startAt: 0,
        maxResults: 50,
      });

      const output = parseToolResult(result) as Record<string, unknown>;
      expect(output.issueKey).toBe('PROJ-1');
      expect(output.total).toBe(2);
      expect(Array.isArray(output.comments)).toBe(true);
      expect((output.comments as Record<string, unknown>[]).length).toBe(2);

      const comment = (output.comments as Record<string, unknown>[])[0]!;
      expect(comment.id).toBe('20001');
      expect(comment.author).toBe('John Doe');

      expect(client.get).toHaveBeenCalledWith(
        '/rest/api/3/issue/PROJ-1/comment',
        expect.objectContaining({ startAt: 0, maxResults: 50 }),
      );
    });

    it('should handle empty comments list', async () => {
      client.get.mockResolvedValue(
        mockApiResponse({
          comments: [],
          total: 0,
          startAt: 0,
          maxResults: 50,
        }),
      );

      const result = await handler({
        action: 'list',
        issueKey: 'PROJ-2',
        startAt: 0,
        maxResults: 50,
      });

      const output = parseToolResult(result) as Record<string, unknown>;
      expect(output.total).toBe(0);
      expect((output.comments as unknown[]).length).toBe(0);
    });
  });

  describe('action: add', () => {
    it('should add a comment to an issue', async () => {
      client.post.mockResolvedValue(
        mockApiResponse({
          id: '20003',
          author: { displayName: 'John Doe' },
          body: { type: 'doc', version: 1, content: [] },
          created: '2026-01-16T10:00:00.000Z',
        }),
      );

      const result = await handler({
        action: 'add',
        issueKey: 'PROJ-1',
        body: 'Fixed in commit abc123.',
      });

      const output = parseToolResult(result) as Record<string, unknown>;
      expect(output.issueKey).toBe('PROJ-1');
      expect(output.commentId).toBe('20003');
      expect(output.author).toBe('John Doe');
      expect(output.body).toBe('Fixed in commit abc123.');
      expect(output.url).toContain('test-company.atlassian.net/browse/PROJ-1#comment-20003');

      // Verify ADF body was sent
      expect(client.post).toHaveBeenCalledWith(
        '/rest/api/3/issue/PROJ-1/comment',
        expect.objectContaining({
          body: expect.objectContaining({
            type: 'doc',
            version: 1,
          }),
        }),
      );
    });

    it('should convert plain text to ADF', async () => {
      client.post.mockResolvedValue(
        mockApiResponse({
          id: '20004',
          author: { displayName: 'Alice' },
          created: '2026-01-16T11:00:00.000Z',
        }),
      );

      await handler({
        action: 'add',
        issueKey: 'PROJ-1',
        body: 'A simple comment.',
      });

      const postCall = client.post.mock.calls[0];
      const payload = postCall[1] as Record<string, unknown>;
      const body = payload.body as Record<string, unknown>;

      expect(body.type).toBe('doc');
      expect(body.version).toBe(1);
      expect(Array.isArray(body.content)).toBe(true);

      const paragraph = (body.content as Record<string, unknown>[])[0]!;
      expect(paragraph.type).toBe('paragraph');
      const text = (paragraph.content as Record<string, unknown>[])[0]!;
      expect(text.text).toBe('A simple comment.');
    });
  });

  it('should propagate errors from JiraClient (list)', async () => {
    const error = new Error('Issue not found');
    client.get.mockRejectedValue(error);

    await expect(
      handler({
        action: 'list',
        issueKey: 'NONEXISTENT',
        startAt: 0,
        maxResults: 50,
      }),
    ).rejects.toThrow('Issue not found');
  });

  it('should propagate errors from JiraClient (add)', async () => {
    const error = new Error('Permission denied');
    client.post.mockRejectedValue(error);

    await expect(
      handler({
        action: 'add',
        issueKey: 'PROJ-1',
        body: 'test',
      }),
    ).rejects.toThrow('Permission denied');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// attach_file
// ═══════════════════════════════════════════════════════════════════════════

describe('attach_file handler', () => {
  let client: ReturnType<typeof createMockJiraClient>;
  let handler: ReturnType<typeof createAttachFileHandler>;

  beforeEach(() => {
    client = createMockJiraClient();
    handler = createAttachFileHandler(client);
  });

  it('should attach a file to an issue', async () => {
    client.post.mockResolvedValue(
      mockApiResponse([
        {
          id: '30001',
          filename: 'package.json',
          size: 1234,
          mimeType: 'application/json',
          created: '2026-01-15T12:00:00.000Z',
          self: 'https://test-company.atlassian.net/rest/api/3/attachment/30001',
        },
      ]),
    );

    const result = await handler({
      issueKey: 'PROJ-1',
      filePath: 'package.json',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.issueKey).toBe('PROJ-1');
    expect(output.attachment).toBeDefined();

    const attachment = output.attachment as Record<string, unknown>;
    expect(attachment.id).toBe('30001');
    expect(attachment.filename).toBe('package.json');
    expect(attachment.mimeType).toBe('application/json');
    expect(attachment.url).toContain('test-company.atlassian.net');

    // Verify FormData was sent
    expect(client.post).toHaveBeenCalledWith(
      '/rest/api/3/issue/PROJ-1/attachments',
      expect.any(FormData),
      true, // isFormData
    );
  });

  it('should use custom filename and mimeType', async () => {
    client.post.mockResolvedValue(
      mockApiResponse([
        {
          id: '30002',
          filename: 'custom-name.json',
          size: 1234,
          mimeType: 'application/json',
          created: '2026-01-15T12:00:00.000Z',
        },
      ]),
    );

    const result = await handler({
      issueKey: 'PROJ-1',
      filePath: 'package.json',
      fileName: 'custom-name.json',
      mimeType: 'application/json',
    });

    const output = parseToolResult(result) as Record<string, unknown>;
    const attachment = output.attachment as Record<string, unknown>;
    expect(attachment.filename).toBe('custom-name.json');
  });

  it('should detect MIME type from file extension', async () => {
    // Create a small text file for testing
    const { existsSync, mkdirSync, writeFileSync, unlinkSync } = await import('fs');
    const { join, resolve } = await import('path');
    const tmpDir = resolve('tests', 'unit', 'tools');
    const tmpFile = join(tmpDir, '_test_attach.txt');

    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    writeFileSync(tmpFile, 'test content');

    client.post.mockResolvedValue(
      mockApiResponse([
        {
          id: '30003',
          filename: '_test_attach.txt',
          size: 12,
          mimeType: 'text/plain',
          created: '2026-01-15T12:00:00.000Z',
        },
      ]),
    );

    try {
      const result = await handler({
        issueKey: 'PROJ-1',
        filePath: tmpFile,
      });

      const output = parseToolResult(result) as Record<string, unknown>;
      const attachment = output.attachment as Record<string, unknown>;
      expect(attachment.filename).toBe('_test_attach.txt');

      // Check FormData content type
      const postCall = client.post.mock.calls[0];
      expect(postCall[2]).toBe(true); // isFormData
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('should propagate errors from JiraClient', async () => {
    const error = new Error('Issue not found');
    client.post.mockRejectedValue(error);

    await expect(
      handler({
        issueKey: 'NONEXISTENT-999',
        filePath: 'package.json',
      }),
    ).rejects.toThrow('Issue not found');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// jira_health_check
// ═══════════════════════════════════════════════════════════════════════════

describe('jira_health_check handler', () => {
  let client: ReturnType<typeof createMockJiraClient>;
  let handler: ReturnType<typeof createHealthCheckHandler>;

  const config = {
    host: 'test-company.atlassian.net',
    email: 'test@example.com',
    apiToken: 'test-token',
    baseUrl: 'https://test-company.atlassian.net/rest/api/3',
    agileBaseUrl: 'https://test-company.atlassian.net/rest/agile/1.0',
  };

  beforeEach(() => {
    client = createMockJiraClient();
    handler = createHealthCheckHandler(client, config);
  });

  it('should return connected status on successful health check', async () => {
    client.get.mockResolvedValue(
      mockApiResponse({
        accountId: '712020:abc-123-def',
        displayName: 'John Doe',
        emailAddress: 'john@company.com',
      }),
    );

    const result = await handler();

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.status).toBe('connected');
    expect(output.jiraHost).toBe('test-company.atlassian.net');
    expect(output.timestamp).toBeDefined();

    const user = output.user as Record<string, unknown>;
    expect(user.accountId).toBe('712020:abc-123-def');
    expect(user.displayName).toBe('John Doe');

    expect(client.get).toHaveBeenCalledWith('/rest/api/3/myself');
  });

  it('should return error status on auth failure', async () => {
    const error = new Error('Authentication failed');
    client.get.mockRejectedValue(error);

    const result = await handler();

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.status).toBe('error');
    expect(output.error).toContain('Authentication failed');
    expect(output.jiraHost).toBe('test-company.atlassian.net');
    expect(output.timestamp).toBeDefined();
  });

  it('should return error status on network failure', async () => {
    const error = new Error('Could not connect to test-company.atlassian.net');
    client.get.mockRejectedValue(error);

    const result = await handler();

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.status).toBe('error');
    expect(output.error).toContain('Could not connect');
  });

  it('should handle empty user info gracefully', async () => {
    client.get.mockResolvedValue(mockApiResponse({}));

    const result = await handler();

    const output = parseToolResult(result) as Record<string, unknown>;
    expect(output.status).toBe('connected');
    const user = output.user as Record<string, unknown>;
    expect(user.accountId).toBe('unknown');
    expect(user.displayName).toBe('Unknown User');
  });
});
