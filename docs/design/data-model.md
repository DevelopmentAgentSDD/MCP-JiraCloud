# Data Model — opencode-jira-mcp

> **Proyecto:** opencode-jira-mcp
> **Tipo:** Modelo de datos interno (TypeScript interfaces)
> **Versión:** MVP v1.0.0
> **Fecha:** 2026-06-13

---

## 1. Visión General

El MCP Server es **stateless**: no tiene base de datos, no persiste estado entre invocaciones y no mantiene caché local en el MVP. Por tanto, el "modelo de datos" consiste en:

1. **Tipos de dominio Jira** — Interfaces TypeScript que modelan las respuestas de Jira Cloud REST API v3 y Agile API, simplificadas para el consumo del LLM.
2. **Tipos de configuración** — Estructura de `JiraConfig` y validación de variables de entorno.
3. **Tipos del protocolo MCP** — Interfaces para JSON-RPC 2.0 y el ciclo de vida MCP.
4. **Tipos de utilidad** — Paginación, errores, resultados compartidos.

---

## 2. Tipos de Dominio Jira

### 2.1 Issue

```typescript
// src/types/jira.ts

/**
 * Representación simplificada de un Issue de Jira para consumo del LLM.
 * Basado en la respuesta de GET /rest/api/3/issue y POST /rest/api/3/search.
 * Solo se incluyen los campos más relevantes para mantener las respuestas concisas.
 */
export interface Issue {
  /** Issue key (e.g., "PROJ-123") */
  key: string;

  /** Numeric issue ID (string porque Jira los devuelve como string) */
  id: string;

  /** Issue summary/title */
  summary: string;

  /** Issue type name (Task, Bug, Story, Epic, Subtask) */
  issueType: string;

  /** Current status name (e.g., "In Progress", "Done") */
  status: string;

  /** Priority level. Undefined si el proyecto no usa prioridades */
  priority?: string;

  /** Display name of the assignee. Undefined si no está asignado */
  assignee?: string;

  /** Account ID of the assignee */
  assigneeAccountId?: string;

  /** Display name of the reporter */
  reporter?: string;

  /** ISO 8601 creation timestamp */
  created: string;

  /** ISO 8601 last update timestamp */
  updated: string;

  /** ISO 8601 due date (solo si está configurado) */
  dueDate?: string;

  /** Labels applied to the issue */
  labels?: string[];

  /** Direct URL to the issue in Jira */
  url: string;

  /** Issue description (incluido solo cuando se solicita explícitamente o en create_issue response) */
  description?: string;
}

/**
 * Resultado paginado de búsqueda de issues.
 */
export interface IssueSearchResult {
  /** Total number of matching issues */
  total: number;

  /** Current pagination offset */
  startAt: number;

  /** Maximum results returned in this page */
  maxResults: number;

  /** List of issues matching the query */
  issues: Issue[];
}
```

### 2.2 Sprint

```typescript
/**
 * Representación de un Sprint de Jira Agile.
 * Basado en la respuesta de GET /rest/agile/1.0/board/{boardId}/sprint.
 */
export interface Sprint {
  /** Numeric sprint ID */
  id: number;

  /** Sprint name (e.g., "Sprint 12") */
  name: string;

  /** Sprint state: "active", "future", "closed" */
  state: 'active' | 'future' | 'closed';

  /** Sprint goal (puede estar vacío) */
  goal?: string;

  /** Sprint start date (ISO 8601 date string) */
  startDate?: string;

  /** Sprint end date (ISO 8601 date string) */
  endDate?: string;

  /** Number of issues in the sprint */
  issueCount: number;

  /** Issues in the sprint (solo presente si includeIssues=true en la request) */
  issues?: Issue[];
}

/**
 * Resultado de consulta de sprints.
 */
export interface SprintSearchResult {
  /** Board ID usado para la consulta */
  boardId: number;

  /** Board name */
  boardName: string;

  /** Total sprints matching the filter */
  total: number;

  /** List of sprints */
  sprints: Sprint[];
}
```

### 2.3 User

```typescript
/**
 * Representación simplificada de un usuario de Jira.
 * Basado en GET /rest/api/3/myself y campos user en responses de Issue.
 */
export interface JiraUser {
  /** Atlassian Account ID (e.g., "712020:abc-123-def") */
  accountId: string;

  /** Full display name */
  displayName: string;

  /** Email address (puede estar vacío si la configuración de privacidad lo oculta) */
  emailAddress?: string;

  /** Avatar URL (para uso futuro) */
  avatarUrl?: string;
}
```

### 2.4 Comment

```typescript
/**
 * Representación de un comentario en un Issue de Jira.
 * Basado en GET /rest/api/3/issue/{key}/comment.
 */
export interface JiraComment {
  /** Comment ID (string) */
  id: string;

  /** Display name of the comment author */
  author: string;

  /** Account ID of the author */
  authorAccountId?: string;

  /** Comment body text (puede incluir markdown de Jira) */
  body: string;

  /** ISO 8601 creation timestamp */
  created: string;

  /** ISO 8601 last update timestamp */
  updated: string;
}

/**
 * Resultado de listar comentarios.
 */
export interface CommentListResult {
  /** Issue key */
  issueKey: string;

  /** Total number of comments */
  total: number;

  /** Pagination offset */
  startAt: number;

  /** Max results per page */
  maxResults: number;

  /** List of comments */
  comments: JiraComment[];
}

/**
 * Resultado de añadir un comentario.
 */
export interface CommentAddResult {
  /** Issue key */
  issueKey: string;

  /** ID of the created comment */
  commentId: string;

  /** Author display name */
  author: string;

  /** Comment body as created */
  body: string;

  /** ISO 8601 creation timestamp */
  created: string;

  /** Direct link to the issue */
  url: string;
}
```

### 2.5 Transition

```typescript
/**
 * Representación de una transición de workflow en Jira.
 * Basado en GET /rest/api/3/issue/{key}/transitions.
 */
export interface JiraTransition {
  /** Numeric transition ID (string) */
  id: string;

  /** Human-readable transition name (e.g., "Start Progress") */
  name: string;

  /** Target status after executing this transition */
  toStatus: string;

  /** Whether a resolution is required for this transition */
  requiresResolution?: boolean;
}

/**
 * Resultado de ejecutar una transición.
 */
export interface TransitionResult {
  /** Issue key */
  key: string;

  /** Whether a transition was executed */
  transitioned: boolean;

  /** Previous status (solo si se ejecutó transición) */
  fromStatus?: string;

  /** New status after transition (solo si se ejecutó transición) */
  toStatus?: string;

  /** Direct link to the issue */
  url: string;

  /** List of available transitions (siempre presente en listTransitions=true, o si una transición falló) */
  availableTransitions?: JiraTransition[];
}
```

### 2.6 Attachment

```typescript
/**
 * Representación de un archivo adjunto en Jira.
 * Basado en POST /rest/api/3/issue/{key}/attachments.
 */
export interface JiraAttachment {
  /** Attachment ID */
  id: string;

  /** Original filename */
  filename: string;

  /** File size in bytes */
  size: number;

  /** MIME type of the file */
  mimeType: string;

  /** ISO 8601 creation timestamp */
  created: string;

  /** Direct URL to the attachment in Jira */
  url: string;
}

/**
 * Resultado de adjuntar un archivo.
 */
export interface AttachmentResult {
  /** Issue key */
  issueKey: string;

  /** Created attachment metadata */
  attachment: JiraAttachment;
}
```

### 2.7 Tipos Compartidos

```typescript
/**
 * Parámetros de paginación estándar usados en múltiples tools.
 */
export interface PaginationParams {
  /** Offset inicial (base 0) */
  startAt: number;

  /** Máximo de resultados a devolver */
  maxResults: number;
}

/**
 * Criterios de ordenamiento.
 */
export interface SortCriteria {
  /** Field name + direction (e.g., "created DESC") */
  orderBy: string;
}

/**
 * Resultado de health check.
 */
export interface HealthCheckResult {
  /** Connection status */
  status: 'connected' | 'error';

  /** Authenticated user info (presente cuando status="connected") */
  user?: JiraUser;

  /** Jira host being connected to */
  jiraHost: string;

  /** ISO 8601 timestamp of the check */
  timestamp: string;

  /** Error message (presente cuando status="error") */
  error?: string;
}

/**
 * Resultado de crear un issue.
 */
export interface CreateIssueResult {
  /** Created issue key */
  key: string;

  /** Numeric issue ID */
  id: string;

  /** Direct URL to the issue */
  url: string;

  /** Issue summary as created */
  summary: string;

  /** Issue type as created */
  issueType: string;

  /** Initial status */
  status: string;
}

/**
 * Resultado de actualizar un issue.
 */
export interface UpdateIssueResult {
  /** Updated issue key */
  key: string;

  /** Whether the update was applied */
  updated: boolean;

  /** List of fields that were changed */
  changedFields: string[];

  /** Direct link to the issue */
  url: string;
}

/**
 * Resultado de asignar/desasignar usuario.
 */
export interface AssignUserResult {
  /** Issue key */
  key: string;

  /** Current assignee (null si desasignado) */
  assignee: JiraUser | null;

  /** Direct link to the issue */
  url: string;
}
```

---

## 3. Tipos de Configuración

### 3.1 JiraConfig

```typescript
// src/types/config.ts

/**
 * Configuración del MCP Server leída de variables de entorno.
 */
export interface JiraConfig {
  /** Jira Cloud host (e.g., "my-company.atlassian.net"). Sin protocolo ni path. */
  host: string;

  /** Email de la cuenta Atlassian */
  email: string;

  /** API Token de Atlassian. NUNCA se loguea ni serializa. */
  apiToken: string;

  /** URL base de la API REST v3 (derivada de host) */
  baseUrl: string;

  /** URL base de la Agile API (derivada de host) */
  agileBaseUrl: string;
}

/**
 * Configuración sanitizada para logging.
 * El token se reemplaza por "***SET***" o "NOT SET".
 */
export interface SanitizedConfig {
  host: string;
  email: string;
  apiToken: '***SET***' | 'NOT SET';
}

/**
 * Configuración de rate limiting.
 */
export interface RateLimitConfig {
  /** Máximo número de reintentos antes de fallar */
  maxRetries: number;

  /** Timeout base en milisegundos (usado si no hay header Retry-After) */
  baseTimeoutMs: number;

  /** Timeout máximo por request HTTP */
  requestTimeoutMs: number;
}

/**
 * Configuración por defecto.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRetries: 3,
  baseTimeoutMs: 30_000,    // 30 segundos
  requestTimeoutMs: 30_000, // 30 segundos por request
};
```

### 3.2 Validación y Carga de Configuración

```typescript
// src/config/index.ts

import { z } from 'zod';

/**
 * Schema de validación para variables de entorno.
 */
export const EnvSchema = z.object({
  JIRA_HOST: z.string()
    .min(1, 'JIRA_HOST is required. Set it to your Jira Cloud domain (e.g., "my-company.atlassian.net").')
    .refine((val) => !val.startsWith('https://') && !val.startsWith('http://'), {
      message: 'JIRA_HOST must not include protocol (e.g., "my-company.atlassian.net", not "https://...").',
    }),
  JIRA_EMAIL: z.string()
    .min(1, 'JIRA_EMAIL is required. Set it to your Atlassian account email.')
    .email('JIRA_EMAIL must be a valid email address.'),
  JIRA_API_TOKEN: z.string()
    .min(1, 'JIRA_API_TOKEN is required. Generate one at https://id.atlassian.com/manage/api-tokens'),
});

export type EnvVars = z.infer<typeof EnvSchema>;

/**
 * Carga y valida la configuración desde variables de entorno.
 * Lanza error descriptivo si falta alguna variable requerida.
 */
export function loadConfig(): JiraConfig {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration error:\n${errors}`);
  }

  const { JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN } = result.data;

  return {
    host: JIRA_HOST,
    email: JIRA_EMAIL,
    apiToken: JIRA_API_TOKEN,
    baseUrl: `https://${JIRA_HOST}/rest/api/3`,
    agileBaseUrl: `https://${JIRA_HOST}/rest/agile/1.0`,
  };
}

/**
 * Obtiene una versión sanitizada de la configuración para logging.
 */
export function sanitizeConfig(config: JiraConfig): SanitizedConfig {
  return {
    host: config.host,
    email: config.email,
    apiToken: config.apiToken ? '***SET***' : 'NOT SET',
  };
}
```

---

## 4. Tipos del Protocolo MCP

### 4.1 JSON-RPC 2.0

```typescript
// src/types/mcp.ts

/**
 * Request JSON-RPC 2.0 recibido del cliente MCP vía stdin.
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

/**
 * Response JSON-RPC 2.0 enviado al cliente MCP vía stdout.
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * Error JSON-RPC 2.0.
 */
export interface JsonRpcError {
  /** Código de error (números negativos reservados para JSON-RPC) */
  code: number;

  /** Mensaje descriptivo para el cliente */
  message: string;

  /** Datos adicionales opcionales (ej: detalles de validación) */
  data?: unknown;
}

/**
 * Códigos de error JSON-RPC estándar y custom.
 */
export const ErrorCodes = {
  /** Parse error — JSON malformado */
  PARSE_ERROR: -32700,

  /** Invalid Request — no es un request JSON-RPC válido */
  INVALID_REQUEST: -32600,

  /** Method not found — la tool no existe */
  METHOD_NOT_FOUND: -32601,

  /** Invalid params — validación de entrada fallida */
  INVALID_PARAMS: -32602,

  /** Internal error — error genérico del servidor */
  INTERNAL_ERROR: -32603,

  /** Server error — errores de aplicación (Jira API, red, etc.) */
  SERVER_ERROR: -32000,
} as const;
```

### 4.2 Tool Definition

```typescript
/**
 * Definición de una tool MCP expuesta en tools/list.
 * Coincide con la interfaz del SDK: @modelcontextprotocol/sdk.
 */
export interface ToolDefinition {
  /** Nombre de la tool en snake_case */
  name: string;

  /** Descripción para el LLM */
  description: string;

  /** JSON Schema de los parámetros de entrada */
  inputSchema: Record<string, unknown>;
}
```

### 4.3 Tool Call Result

```typescript
/**
 * Resultado de una invocación de tool (tools/call response).
 * Coincide con la interfaz del SDK: @modelcontextprotocol/sdk.
 */
export interface ToolCallResult {
  /** Array de contenido. Para este MCP, siempre es un solo elemento text. */
  content: ToolCallContent[];

  /** true si la tool encontró un error manejado (se muestra como warning al LLM) */
  isError?: boolean;
}

export interface ToolCallContent {
  /** Tipo de contenido. "text" para JSON serializado. */
  type: 'text' | 'image' | 'resource';

  /** Contenido textual (JSON.stringify del resultado) */
  text?: string;

  /** Datos binarios (no usado en este MCP) */
  data?: string;

  /** MIME type (no usado en este MCP) */
  mimeType?: string;
}
```

---

## 5. Tipos del Cliente HTTP Jira

### 5.1 Request y Response

```typescript
// src/client/jira-client.ts

/**
 * Opciones para requests HTTP a Jira API.
 */
export interface JiraRequestOptions {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';

  /** Path relativo a baseUrl (ej: "/issue/PROJ-123") */
  path: string;

  /** Query parameters */
  query?: Record<string, string | number | boolean | undefined>;

  /** Request body (se serializa a JSON automáticamente) */
  body?: unknown;

  /** Headers adicionales (Authorization se añade automáticamente) */
  headers?: Record<string, string>;

  /** Si es true, usa agileBaseUrl en lugar de baseUrl */
  useAgileApi?: boolean;

  /** Si es true, no serializa el body como JSON (para FormData) */
  isFormData?: boolean;

  /** Timeout específico para este request (ms). Default: 30000 */
  timeoutMs?: number;
}

/**
 * Respuesta HTTP de Jira API.
 */
export interface JiraApiResponse<T = unknown> {
  /** HTTP status code */
  status: number;

  /** Response body parseado como JSON (o raw para no-JSON) */
  data: T;

  /** Headers de la respuesta */
  headers: Record<string, string>;
}

/**
 * Error estándar de Jira API.
 */
export interface JiraErrorResponse {
  /** Array de mensajes de error legibles */
  errorMessages?: string[];

  /** Mapa de errores por campo */
  errors?: Record<string, string>;

  /** HTTP status code */
  status?: number;
}
```

### 5.2 Rate Limiter

```typescript
/**
 * Estado interno del rate limiter.
 * No se exporta fuera del módulo rate-limiter.ts.
 */
export interface RateLimitState {
  /** Número de reintentos realizados para el request actual */
  attempt: number;

  /** Timestamp del último intento */
  lastAttemptTime: number;

  /** Tiempo de espera del último header Retry-After recibido */
  lastRetryAfter: number;
}

/**
 * Resultado de un intento con rate limiting.
 */
export interface RateLimitAttemptResult<T> {
  /** Si el request fue exitoso */
  success: boolean;

  /** Datos de la respuesta (si success=true) */
  data?: T;

  /** Error (si success=false) */
  error?: {
    status: number;
    message: string;
    retryAfter?: number;
  };
}
```

---

## 6. Tipos de Errores

### 6.1 Error de Aplicación

```typescript
// src/utils/errors.ts

/**
 * Error base para el MCP Server.
 */
export class McpError extends Error {
  /** Código de error JSON-RPC */
  public readonly code: number;

  /** Datos adicionales para el cliente */
  public readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.data = data;
  }

  /** Convierte a JsonRpcError para serializar en la respuesta */
  toJsonRpcError(): JsonRpcError {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

/**
 * Error de validación de entrada.
 */
export class ValidationError extends McpError {
  constructor(validationErrors: Array<{ path: string; message: string; received?: unknown }>) {
    super(
      ErrorCodes.INVALID_PARAMS,
      'Invalid parameters. Check the input values.',
      { validationErrors }
    );
    this.name = 'ValidationError';
  }
}

/**
 * Error de autenticación con Jira.
 */
export class JiraAuthError extends McpError {
  constructor(message?: string) {
    super(
      ErrorCodes.SERVER_ERROR,
      message || 'Authentication failed. Verify JIRA_EMAIL and JIRA_API_TOKEN. ' +
        'Generate a new token at https://id.atlassian.com/manage/api-tokens'
    );
    this.name = 'JiraAuthError';
  }
}

/**
 * Error de rate limit excedido.
 */
export class RateLimitError extends McpError {
  constructor(retriesAttempted: number) {
    super(
      ErrorCodes.SERVER_ERROR,
      `Jira API rate limit exceeded after ${retriesAttempted} retries. Please wait and try again later.`
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Error de red / conectividad.
 */
export class NetworkError extends McpError {
  constructor(host: string, cause?: string) {
    super(
      ErrorCodes.SERVER_ERROR,
      `Could not connect to Jira Cloud at ${host}. ${cause || 'Check JIRA_HOST and network connectivity.'}`
    );
    this.name = 'NetworkError';
  }
}

/**
 * Error de timeout.
 */
export class TimeoutError extends McpError {
  constructor(endpoint: string, timeoutMs: number) {
    super(
      ErrorCodes.SERVER_ERROR,
      `Request to Jira API (${endpoint}) timed out after ${timeoutMs / 1000} seconds.`
    );
    this.name = 'TimeoutError';
  }
}
```

---

## 7. Diagrama de Relaciones

```
┌─────────────────────────────────────────────────────────────┐
│                     Tipos de Dominio Jira                     │
│                                                             │
│  Issue ───────────── IssueSearchResult (paginado)           │
│  Sprint ──────────── SprintSearchResult                     │
│  JiraUser                                                   │
│  JiraComment ─────── CommentListResult / CommentAddResult   │
│  JiraTransition ──── TransitionResult                       │
│  JiraAttachment ──── AttachmentResult                       │
│                                                             │
│  Resultados CRUD:                                           │
│  CreateIssueResult, UpdateIssueResult, AssignUserResult     │
│  HealthCheckResult                                          │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ usados por
                            │
┌─────────────────────────────────────────────────────────────┐
│                     Tool Handlers                            │
│  search-issues.ts    → IssueSearchResult                    │
│  create-issue.ts     → CreateIssueResult                    │
│  update-issue.ts     → UpdateIssueResult                    │
│  transition-issue.ts → TransitionResult                     │
│  get-sprints.ts      → SprintSearchResult                   │
│  assign-user.ts      → AssignUserResult                     │
│  manage-comments.ts  → CommentListResult / CommentAddResult │
│  attach-file.ts      → AttachmentResult                     │
│  health-check.ts     → HealthCheckResult                    │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ usan
                            │
┌─────────────────────────────────────────────────────────────┐
│                     Jira Client (HTTP)                       │
│  JiraRequestOptions, JiraApiResponse<T>, JiraErrorResponse  │
│  RateLimitState, RateLimitAttemptResult                     │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ configurado con
                            │
┌─────────────────────────────────────────────────────────────┐
│                     Configuration                            │
│  JiraConfig, SanitizedConfig, RateLimitConfig, EnvSchema    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Protocolo MCP                            │
│  JsonRpcRequest, JsonRpcResponse, JsonRpcError              │
│  ToolDefinition, ToolCallResult, ToolCallContent            │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ lanzados por handlers
                            │
┌─────────────────────────────────────────────────────────────┐
│                     Errores                                  │
│  McpError, ValidationError, JiraAuthError,                  │
│  RateLimitError, NetworkError, TimeoutError                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Convenciones de Nombrado TypeScript

| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Interfaces de dominio | PascalCase, sustantivo | `Issue`, `Sprint`, `JiraUser` |
| Interfaces de resultado | PascalCase, sufijo `Result` | `IssueSearchResult`, `CreateIssueResult` |
| Interfaces de config | PascalCase, sufijo `Config` | `JiraConfig`, `RateLimitConfig` |
| Schemas Zod | PascalCase, sufijo `Schema` | `SearchIssuesInputSchema` |
| Tipos inferidos de Zod | PascalCase, sufijo `Input`/`Output` | `SearchIssuesInput`, `SearchIssuesOutput` |
| Clases de error | PascalCase, sufijo `Error` | `JiraAuthError`, `NetworkError` |
| Constantes | UPPER_SNAKE_CASE | `DEFAULT_RATE_LIMIT_CONFIG`, `ErrorCodes` |
| Campos de API | camelCase (Jira usa PascalCase/snake_case, mapeamos) | `issueType` ← `issuetype` |
| Timestamps | string ISO 8601 | `"2026-06-13T14:00:00Z"` |
| IDs numéricos | string o number según API Jira | `id: string`, `sprintId: number` |

---

## 9. Reglas de Transformación Jira → Modelo Interno

### 9.1 Mapeo de Campos

| Campo Jira API v3 | Campo Modelo Interno | Transformación |
|-------------------|---------------------|----------------|
| `key` | `key` | Directo |
| `id` | `id` | Directo (string) |
| `fields.summary` | `summary` | Directo |
| `fields.issuetype.name` | `issueType` | Extraído del objeto anidado |
| `fields.status.name` | `status` | Extraído del objeto anidado |
| `fields.priority.name` | `priority` | Extraído; undefined si no existe |
| `fields.assignee.displayName` | `assignee` | Extraído; undefined si `assignee` es null |
| `fields.assignee.accountId` | `assigneeAccountId` | Extraído |
| `fields.reporter.displayName` | `reporter` | Extraído |
| `fields.created` | `created` | Directo (ISO 8601) |
| `fields.updated` | `updated` | Directo (ISO 8601) |
| `fields.duedate` | `dueDate` | Directo; undefined si null |
| `fields.labels` | `labels` | Directo (string[]) |
| `self` | `url` | Reconstruido: `https://{host}/browse/{key}` |

### 9.2 Transformador Genérico

```typescript
/**
 * Transforma la respuesta estándar de Jira Issue a nuestro modelo simplificado.
 */
export function mapJiraIssue(raw: JiraRawIssue, host: string): Issue {
  const fields = raw.fields ?? {};

  return {
    key: raw.key,
    id: raw.id,
    summary: fields.summary ?? '',
    issueType: fields.issuetype?.name ?? 'Unknown',
    status: fields.status?.name ?? 'Unknown',
    priority: fields.priority?.name,
    assignee: fields.assignee?.displayName,
    assigneeAccountId: fields.assignee?.accountId,
    reporter: fields.reporter?.displayName,
    created: fields.created,
    updated: fields.updated,
    dueDate: fields.duedate,
    labels: fields.labels,
    url: `https://${host}/browse/${raw.key}`,
    description: fields.description,
  };
}

/**
 * Raw response de Jira (match parcial, solo campos relevantes).
 */
interface JiraRawIssue {
  key: string;
  id: string;
  fields?: {
    summary?: string;
    issuetype?: { name?: string };
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: { accountId?: string; displayName?: string } | null;
    reporter?: { displayName?: string };
    created?: string;
    updated?: string;
    duedate?: string | null;
    labels?: string[];
    description?: string;
  };
}
```
