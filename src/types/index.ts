// ============================================================================
// Tipos del Protocolo MCP (JSON-RPC 2.0)
// ============================================================================

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
} as const;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  content: ToolCallContent[];
  isError?: boolean;
}

export interface ToolCallContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

// ============================================================================
// Tipos de dominio Jira
// ============================================================================

export interface Issue {
  key: string;
  id: string;
  summary: string;
  issueType: string;
  status: string;
  priority?: string;
  assignee?: string;
  assigneeAccountId?: string;
  reporter?: string;
  created: string;
  updated: string;
  dueDate?: string;
  labels?: string[];
  url: string;
  description?: string;
}

export interface IssueSearchResult {
  total: number;
  startAt: number;
  maxResults: number;
  issues: Issue[];
}

export interface Sprint {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed';
  goal?: string;
  startDate?: string;
  endDate?: string;
  issueCount: number;
  issues?: Issue[];
}

export interface SprintSearchResult {
  boardId: number;
  boardName: string;
  total: number;
  sprints: Sprint[];
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrl?: string;
}

export interface JiraComment {
  id: string;
  author: string;
  authorAccountId?: string;
  body: string;
  created: string;
  updated: string;
}

export interface CommentListResult {
  issueKey: string;
  total: number;
  startAt: number;
  maxResults: number;
  comments: JiraComment[];
}

export interface CommentAddResult {
  issueKey: string;
  commentId: string;
  author: string;
  body: string;
  created: string;
  url: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  toStatus: string;
  requiresResolution?: boolean;
}

export interface TransitionResult {
  key: string;
  transitioned: boolean;
  fromStatus?: string;
  toStatus?: string;
  url: string;
  availableTransitions?: JiraTransition[];
}

export interface JiraAttachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  created: string;
  url: string;
}

export interface AttachmentResult {
  issueKey: string;
  attachment: JiraAttachment;
}

export interface CreateIssueResult {
  key: string;
  id: string;
  url: string;
  summary: string;
  issueType: string;
  status: string;
}

export interface UpdateIssueResult {
  key: string;
  updated: boolean;
  changedFields: string[];
  url: string;
}

export interface AssignUserResult {
  key: string;
  assignee: JiraUser | null;
  url: string;
}

export interface HealthCheckResult {
  status: 'connected' | 'error';
  user?: JiraUser;
  jiraHost: string;
  timestamp: string;
  error?: string;
}

// ============================================================================
// Tipos de configuracion
// ============================================================================

export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
  baseUrl: string;
  agileBaseUrl: string;
}

export interface SanitizedConfig {
  host: string;
  email: string;
  apiToken: '***SET***' | 'NOT SET';
}

export interface RateLimitConfig {
  maxRetries: number;
  baseTimeoutMs: number;
  requestTimeoutMs: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRetries: 3,
  baseTimeoutMs: 30_000,
  requestTimeoutMs: 30_000,
};

// ============================================================================
// Tipos del cliente HTTP Jira
// ============================================================================

export interface JiraRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  useAgileApi?: boolean;
  isFormData?: boolean;
  timeoutMs?: number;
}

export interface JiraApiResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface JiraErrorResponse {
  errorMessages?: string[];
  errors?: Record<string, string>;
  status?: number;
}

// ============================================================================
// Tipos de paginacion y utilidad
// ============================================================================

export interface PaginationParams {
  startAt: number;
  maxResults: number;
}

export interface SortCriteria {
  orderBy: string;
}
