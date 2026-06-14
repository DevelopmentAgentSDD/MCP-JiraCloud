// ============================================================================
// T017 - Fixtures de respuestas Jira para tests
// ============================================================================

import type {
  Issue,
  IssueSearchResult,
  Sprint,
  SprintSearchResult,
  JiraUser,
  JiraComment,
  JiraTransition,
  TransitionResult,
  CreateIssueResult,
  JiraErrorResponse,
  JiraApiResponse,
  JiraAttachment,
  AttachmentResult,
  CommentListResult,
  CommentAddResult,
  UpdateIssueResult,
  AssignUserResult,
  HealthCheckResult,
} from '../../src/types/index.js';

// --- Issue Fixtures ---

export const mockIssue: Issue = {
  key: 'PROJ-1',
  id: '10001',
  summary: 'Fix login page validation error',
  issueType: 'Bug',
  status: 'In Progress',
  priority: 'High',
  assignee: 'John Doe',
  assigneeAccountId: '5f3a7b2c8d9e0a1b2c3d4e5f',
  reporter: 'Jane Smith',
  created: '2026-01-15T10:30:00.000Z',
  updated: '2026-01-16T14:22:00.000Z',
  dueDate: '2026-01-20',
  labels: ['frontend', 'critical'],
  url: 'https://test-company.atlassian.net/browse/PROJ-1',
  description:
    'The login page shows a validation error when using special characters in the password field.',
};

export const mockIssue2: Issue = {
  key: 'PROJ-2',
  id: '10002',
  summary: 'Add dark mode support to dashboard',
  issueType: 'Story',
  status: 'To Do',
  priority: 'Medium',
  assignee: undefined,
  assigneeAccountId: undefined,
  reporter: 'Jane Smith',
  created: '2026-01-10T08:00:00.000Z',
  updated: '2026-01-12T11:15:00.000Z',
  labels: ['ui', 'enhancement'],
  url: 'https://test-company.atlassian.net/browse/PROJ-2',
};

export const mockIssue3: Issue = {
  key: 'PROJ-3',
  id: '10003',
  summary: 'Update API rate limit documentation',
  issueType: 'Task',
  status: 'Done',
  priority: 'Low',
  assignee: 'Alice Johnson',
  assigneeAccountId: '6a4b8c3d9e0f1a2b3c4d5e6f',
  reporter: 'Bob Wilson',
  created: '2026-01-05T09:00:00.000Z',
  updated: '2026-01-14T16:45:00.000Z',
  labels: ['docs'],
  url: 'https://test-company.atlassian.net/browse/PROJ-3',
};

// --- IssueSearchResult Fixture ---

export const mockIssueSearchResults: IssueSearchResult = {
  total: 3,
  startAt: 0,
  maxResults: 50,
  issues: [mockIssue, mockIssue2, mockIssue3],
};

// --- Sprint Fixtures ---

export const mockSprint: Sprint = {
  id: 101,
  name: 'Sprint 5',
  state: 'active',
  goal: 'Complete core auth module and fix critical bugs',
  startDate: '2026-01-13',
  endDate: '2026-01-27',
  issueCount: 8,
  issues: [mockIssue, mockIssue2],
};

export const mockSprint2: Sprint = {
  id: 102,
  name: 'Sprint 6',
  state: 'future',
  goal: 'Implement reporting dashboard',
  issueCount: 0,
};

export const mockSprint3: Sprint = {
  id: 100,
  name: 'Sprint 4',
  state: 'closed',
  goal: 'Initial project setup',
  startDate: '2025-12-30',
  endDate: '2026-01-12',
  issueCount: 12,
};

export const mockSprintSearchResult: SprintSearchResult = {
  boardId: 10,
  boardName: 'PROJ Scrum Board',
  total: 3,
  sprints: [mockSprint, mockSprint2, mockSprint3],
};

// --- User Fixtures ---

export const mockUser: JiraUser = {
  accountId: '5f3a7b2c8d9e0a1b2c3d4e5f',
  displayName: 'John Doe',
  emailAddress: 'john.doe@test-company.com',
  avatarUrl: 'https://avatar.atlassian.com/abc123',
};

export const mockUser2: JiraUser = {
  accountId: '6a4b8c3d9e0f1a2b3c4d5e6f',
  displayName: 'Alice Johnson',
  emailAddress: 'alice.johnson@test-company.com',
};

// --- Comment Fixtures ---

export const mockComment: JiraComment = {
  id: '20001',
  author: 'John Doe',
  authorAccountId: '5f3a7b2c8d9e0a1b2c3d4e5f',
  body: 'Working on this now. Found the issue in the password validation regex.',
  created: '2026-01-15T11:00:00.000Z',
  updated: '2026-01-15T11:00:00.000Z',
};

export const mockComment2: JiraComment = {
  id: '20002',
  author: 'Jane Smith',
  authorAccountId: '7b5c9d4e0f1a2b3c4d5e6f7a',
  body: 'Thanks! Let me know if you need any help.',
  created: '2026-01-15T13:30:00.000Z',
  updated: '2026-01-15T13:30:00.000Z',
};

export const mockCommentListResult: CommentListResult = {
  issueKey: 'PROJ-1',
  total: 2,
  startAt: 0,
  maxResults: 50,
  comments: [mockComment, mockComment2],
};

export const mockCommentAddResult: CommentAddResult = {
  issueKey: 'PROJ-1',
  commentId: '20003',
  author: 'John Doe',
  body: 'Fixed in commit abc123. Ready for review.',
  created: '2026-01-16T10:00:00.000Z',
  url: 'https://test-company.atlassian.net/browse/PROJ-1#comment-20003',
};

// --- Transition Fixtures ---

export const mockTransition: JiraTransition = {
  id: '31',
  name: 'In Progress',
  toStatus: 'In Progress',
};

export const mockTransition2: JiraTransition = {
  id: '41',
  name: 'Done',
  toStatus: 'Done',
  requiresResolution: true,
};

export const mockTransition3: JiraTransition = {
  id: '21',
  name: 'To Do',
  toStatus: 'To Do',
};

export const mockTransitionResult: TransitionResult = {
  key: 'PROJ-1',
  transitioned: true,
  fromStatus: 'To Do',
  toStatus: 'In Progress',
  url: 'https://test-company.atlassian.net/browse/PROJ-1',
  availableTransitions: [mockTransition, mockTransition2, mockTransition3],
};

// --- Create Issue Fixture ---

export const mockCreateIssueResponse: CreateIssueResult = {
  key: 'PROJ-4',
  id: '10004',
  url: 'https://test-company.atlassian.net/browse/PROJ-4',
  summary: 'New feature request',
  issueType: 'Story',
  status: 'To Do',
};

// --- Update Issue Fixture ---

export const mockUpdateIssueResponse: UpdateIssueResult = {
  key: 'PROJ-1',
  updated: true,
  changedFields: ['summary', 'priority'],
  url: 'https://test-company.atlassian.net/browse/PROJ-1',
};

// --- Assign User Fixtures ---

export const mockAssignUserResponse: AssignUserResult = {
  key: 'PROJ-1',
  assignee: mockUser,
  url: 'https://test-company.atlassian.net/browse/PROJ-1',
};

export const mockUnassignUserResponse: AssignUserResult = {
  key: 'PROJ-1',
  assignee: null,
  url: 'https://test-company.atlassian.net/browse/PROJ-1',
};

// --- Attachment Fixtures ---

export const mockJiraAttachment: JiraAttachment = {
  id: '30001',
  filename: 'error-screenshot.png',
  size: 245760,
  mimeType: 'image/png',
  created: '2026-01-15T12:00:00.000Z',
  url: 'https://test-company.atlassian.net/rest/api/3/attachment/30001',
};

export const mockAttachmentResult: AttachmentResult = {
  issueKey: 'PROJ-1',
  attachment: mockJiraAttachment,
};

// --- Health Check Fixtures ---

export const mockHealthCheckConnected: HealthCheckResult = {
  status: 'connected',
  user: mockUser,
  jiraHost: 'test-company.atlassian.net',
  timestamp: '2026-01-16T10:00:00.000Z',
};

export const mockHealthCheckError: HealthCheckResult = {
  status: 'error',
  jiraHost: 'test-company.atlassian.net',
  timestamp: '2026-01-16T10:00:00.000Z',
  error: 'Authentication failed',
};

// --- API Response Fixtures ---

export const mockApiResponse = <T>(data: T, status = 200): JiraApiResponse<T> => ({
  status,
  data,
  headers: {
    'content-type': 'application/json',
    'x-request-id': 'test-req-123',
  },
});

// --- Error Response Fixtures ---

export const mockErrorResponse: JiraErrorResponse = {
  errorMessages: ['Issue does not exist or you do not have permission to see it.'],
  errors: {},
};

export const mockAuthErrorResponse: JiraErrorResponse = {
  errorMessages: ['Unauthorized; bearer token not valid or expired.'],
  status: 401,
};

export const mockRateLimitErrorResponse: JiraErrorResponse = {
  errorMessages: ['Rate limit exceeded. Please wait and try again.'],
  status: 429,
};

export const mockNotFoundErrorResponse: JiraErrorResponse = {
  errorMessages: ['Issue does not exist or you do not have permission to see it.'],
  errors: {},
  status: 404,
};

export const mockValidationErrorResponse: JiraErrorResponse = {
  errors: {
    summary: 'Summary is required.',
    project: 'Project key is invalid.',
  },
  status: 400,
};

// --- Config Fixture ---

export const mockJiraConfig = {
  host: 'test-company.atlassian.net',
  email: 'test@example.com',
  apiToken: 'test-api-token-12345',
  baseUrl: 'https://test-company.atlassian.net/rest/api/3',
  agileBaseUrl: 'https://test-company.atlassian.net/rest/agile/1.0',
};
