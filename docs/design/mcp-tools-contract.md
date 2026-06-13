# MCP Tools Contract — opencode-jira-mcp

> **Proyecto:** opencode-jira-mcp
> **Tipo:** MCP Server para Jira Cloud
> **Protocolo:** MCP (Model Context Protocol) sobre stdio (JSON-RPC 2.0)
> **Versión:** MVP v1.0.0
> **Fecha:** 2026-06-13

---

## Convenciones Generales

### Formato de Tool Definition (tools/list)

Cada tool se registra en el MCP Server con esta estructura:

```typescript
interface ToolDefinition {
  name: string;            // snake_case, e.g., "search_issues"
  description: string;     // Descripción para el LLM, incluye sugerencias de uso
  inputSchema: object;     // JSON Schema generado desde Zod (zod-to-json-schema)
}
```

### Formato de Tool Invocation (tools/call)

```typescript
interface ToolCallRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: "tools/call";
  params: {
    name: string;               // Nombre de la tool
    arguments: Record<string, unknown>;  // Argumentos validados contra el schema
  };
}
```

### Formato de Tool Response (tools/call result)

```typescript
interface ToolCallResult {
  content: Array<{
    type: "text";          // Todas las respuestas son text/plain JSON
    text: string;          // JSON.stringify del resultado
  }>;
  isError?: boolean;       // true si la tool encontró un error manejado
}
```

### Códigos de Error JSON-RPC

| Código   | Significado                 | Uso en el MCP                          |
|----------|-----------------------------|----------------------------------------|
| `-32700` | Parse error                 | JSON-RPC malformado en stdin           |
| `-32600` | Invalid Request             | Request no es un JSON-RPC válido       |
| `-32601` | Method not found            | Tool no registrada                     |
| `-32602` | Invalid params              | Validación Zod fallida                 |
| `-32000` | Server error                | Error de Jira API o de red             |

### Mapeo de Errores HTTP de Jira → JSON-RPC

| HTTP Status | JSON-RPC Code | Mensaje patrón para el agente |
|-------------|---------------|-------------------------------|
| `400`       | `-32000`      | `"Jira API error: {errorMessages}. Check your request parameters."` |
| `401`       | `-32000`      | `"Authentication failed. Verify JIRA_EMAIL and JIRA_API_TOKEN at https://id.atlassian.com/manage/api-tokens"` |
| `403`       | `-32000`      | `"Access denied. Your account does not have permission to perform this action on the requested resource."` |
| `404`       | `-32000`      | `"{Resource type} '{identifier}' not found. Verify it exists and you have access."` |
| `429`       | `-32000`      | `"Jira API rate limit exceeded after 3 retries. Please wait and try again later."` |
| `5xx`       | `-32000`      | `"Jira Cloud returned a server error. Try again later."` |

---

## Tool-01: `search_issues`

### Definición

| Campo | Valor |
|-------|-------|
| **name** | `search_issues` |
| **description** | Search for issues in Jira using JQL (Jira Query Language). Supports filtering by project, type, status, assignee, priority, labels, sprint, and free-text search. Results are paginated. By default returns the first 50 matching issues. Use this to find existing issues before creating duplicates. |

### Schema de Entrada (Zod)

```typescript
import { z } from 'zod';

export const SearchIssuesInputSchema = z.object({
  jql: z.string()
    .optional()
    .describe('Raw JQL query string. If provided, all other filter parameters are ignored.'),
  projectKey: z.string()
    .optional()
    .describe('Project key (e.g., "PROJ"). Filters issues by project.'),
  issueType: z.enum(['Task', 'Bug', 'Story', 'Epic', 'Subtask'])
    .optional()
    .describe('Filter by issue type.'),
  status: z.string()
    .optional()
    .describe('Filter by status name (e.g., "In Progress", "Done").'),
  assignee: z.string()
    .optional()
    .describe('Filter by assignee. Use account ID, "currentUser()", or "unassigned".'),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest'])
    .optional()
    .describe('Filter by priority level.'),
  labels: z.array(z.string())
    .optional()
    .describe('Filter by labels (issues must have ALL specified labels).'),
  sprint: z.string()
    .optional()
    .describe('Filter by sprint name or ID.'),
  text: z.string()
    .optional()
    .describe('Free-text search in summary and description fields.'),
  startAt: z.number().int().min(0)
    .default(0)
    .describe('Pagination offset. Default: 0.'),
  maxResults: z.number().int().min(1).max(100)
    .default(50)
    .describe('Maximum results to return. Default: 50, Max: 100.'),
  orderBy: z.string()
    .optional()
    .describe('Sort field and direction (e.g., "created DESC", "priority ASC").'),
  fields: z.array(z.string())
    .optional()
    .describe('Specific fields to include in response (e.g., ["summary", "status", "assignee"]). If omitted, returns default issue view.'),
});

export type SearchIssuesInput = z.infer<typeof SearchIssuesInputSchema>;
```

### Construcción de JQL

Cuando no se proporciona `jql` directo, los parámetros estructurados se combinan:

```typescript
function buildJql(input: SearchIssuesInput): string {
  if (input.jql) return input.jql;

  const clauses: string[] = [];

  if (input.projectKey) clauses.push(`project = "${input.projectKey}"`);
  if (input.issueType) clauses.push(`issuetype = "${input.issueType}"`);
  if (input.status) clauses.push(`status = "${input.status}"`);
  if (input.assignee) {
    if (input.assignee === 'unassigned') clauses.push(`assignee = EMPTY`);
    else if (input.assignee === 'currentUser()') clauses.push(`assignee = currentUser()`);
    else clauses.push(`assignee = "${input.assignee}"`);
  }
  if (input.priority) clauses.push(`priority = "${input.priority}"`);
  if (input.sprint) clauses.push(`sprint = "${input.sprint}"`);
  if (input.text) clauses.push(`text ~ "${input.text}"`);

  let jql = clauses.join(' AND ') || 'created >= -30d';

  if (input.orderBy) jql += ` ORDER BY ${input.orderBy}`;

  return jql;
}
```

### Schema de Salida

```typescript
export const SearchIssuesOutputSchema = z.object({
  total: z.number().int().describe('Total number of issues matching the query.'),
  startAt: z.number().int().describe('Current pagination offset.'),
  maxResults: z.number().int().describe('Maximum results requested for this page.'),
  issues: z.array(z.object({
    key: z.string().describe('Issue key (e.g., "PROJ-123").'),
    id: z.string().describe('Numeric issue ID.'),
    summary: z.string().describe('Issue summary/title.'),
    issueType: z.string().describe('Issue type (Task, Bug, Story, Epic, Subtask).'),
    status: z.string().describe('Current status name.'),
    priority: z.string().optional().describe('Priority level.'),
    assignee: z.string().optional().describe('Assignee display name, null if unassigned.'),
    created: z.string().describe('ISO 8601 creation date.'),
    updated: z.string().describe('ISO 8601 last update date.'),
    url: z.string().describe('Direct link to the issue in Jira.'),
  })).describe('List of matching issues.'),
});

export type SearchIssuesOutput = z.infer<typeof SearchIssuesOutputSchema>;
```

### Mapeo a API Jira

| Atributo | Valor |
|----------|-------|
| **HTTP Method** | `POST` |
| **Endpoint** | `https://{host}/rest/api/3/search` |
| **Headers** | `Authorization: Basic base64(email:token)`, `Accept: application/json`, `Content-Type: application/json` |
| **Body** | `{ "jql": "{constructedJql}", "startAt": 0, "maxResults": 50, "fields": ["summary", "status", ...] }` |
| **Documentación** | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-post |

### Manejo de Errores Específicos

| Escenario | Condición | Mensaje al agente |
|-----------|-----------|-------------------|
| JQL inválido | HTTP 400 | `"JQL syntax error: {errorMessage}. Check your query syntax."` |
| Sin resultados | `total: 0` | Respuesta normal con `issues: []` y `total: 0` |
| Rate limit | HTTP 429 | Reintentos con backoff; si fallan: `"Rate limit exceeded after 3 retries."` |
| Timeout | > 30s | `"Jira API request timed out after 30 seconds. Try reducing maxResults."` |

### Ejemplo de Uso

**Request (tools/call):**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "search_issues",
    "arguments": {
      "projectKey": "PROJ",
      "status": "In Progress",
      "assignee": "currentUser()",
      "maxResults": 10,
      "orderBy": "updated DESC"
    }
  }
}
```

**Response (tools/call result):**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"total\":3,\"startAt\":0,\"maxResults\":10,\"issues\":[{\"key\":\"PROJ-101\",\"id\":\"10101\",\"summary\":\"Fix login crash\",\"issueType\":\"Bug\",\"status\":\"In Progress\",\"priority\":\"High\",\"assignee\":\"John Doe\",\"created\":\"2026-06-10T10:00:00Z\",\"updated\":\"2026-06-12T14:30:00Z\",\"url\":\"https://my-company.atlassian.net/browse/PROJ-101\"}]}"
    }]
  }
}
```

---

## Tool-02: `create_issue`

### Definición

| Campo | Valor |
|-------|-------|
| **name** | `create_issue` |
| **description** | Create a new issue in Jira. Requires at minimum: projectKey, summary, and issueType. Optionally accepts description, priority, assignee, labels, components, sprint assignment, parent issue (for subtasks), epic link, and custom fields. Returns the created issue key, ID, and URL. Before creating, consider using search_issues to check for potential duplicates. |

### Schema de Entrada (Zod)

```typescript
export const CreateIssueInputSchema = z.object({
  projectKey: z.string()
    .min(1)
    .describe('Project key (e.g., "PROJ"). REQUIRED.'),
  summary: z.string()
    .min(1).max(255)
    .describe('Issue title/summary. REQUIRED. Max 255 characters.'),
  issueType: z.enum(['Task', 'Bug', 'Story', 'Epic', 'Subtask'])
    .describe('Issue type. REQUIRED. "Subtask" requires parentKey. "Epic" requires epicName.'),
  description: z.string()
    .optional()
    .describe('Issue description. Supports Jira markdown and Atlassian Document Format (ADF).'),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest'])
    .optional()
    .describe('Priority level. Default: project default.'),
  assignee: z.string()
    .optional()
    .describe('Account ID of the user to assign. Omit for automatic assignment.'),
  labels: z.array(z.string())
    .optional()
    .describe('Labels to apply to the issue.'),
  components: z.array(z.string())
    .optional()
    .describe('Component names to associate with the issue.'),
  sprint: z.string()
    .optional()
    .describe('Sprint name or ID to add the issue to.'),
  parentKey: z.string()
    .optional()
    .describe('Parent issue key. REQUIRED when issueType is "Subtask".'),
  epicLink: z.string()
    .optional()
    .describe('Epic issue key to link (e.g., "PROJ-10"). For Story, Task, Bug types.'),
  epicName: z.string()
    .optional()
    .describe('Epic name. REQUIRED when issueType is "Epic".'),
  customFields: z.record(z.string(), z.unknown())
    .optional()
    .describe('Map of custom field IDs to values. Keys must be like "customfield_10014".'),
});

export type CreateIssueInput = z.infer<typeof CreateIssueInputSchema>;
```

> **Nota de validación cruzada:** En el handler se valida: si `issueType === "Subtask"` → `parentKey` es obligatorio. Si `issueType === "Epic"` → `epicName` es obligatorio.

### Construcción del Payload

```typescript
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
  if (input.components) fields.components = input.components.map(c => ({ name: c }));
  if (input.parentKey) fields.parent = { key: input.parentKey };
  if (input.epicLink) fields.customfield_10014 = input.epicLink;  // Standard epic link field
  if (input.epicName) fields.customfield_10011 = input.epicName;  // Standard epic name field
  if (input.customFields) Object.assign(fields, input.customFields);

  return { fields };
}
```

### Schema de Salida

```typescript
export const CreateIssueOutputSchema = z.object({
  key: z.string().describe('Created issue key (e.g., "PROJ-123").'),
  id: z.string().describe('Numeric issue ID.'),
  url: z.string().describe('Direct link to the issue in Jira.'),
  summary: z.string().describe('Issue summary as created.'),
  issueType: z.string().describe('Issue type as created.'),
  status: z.string().describe('Initial status of the new issue.'),
});

export type CreateIssueOutput = z.infer<typeof CreateIssueOutputSchema>;
```

### Mapeo a API Jira

| Atributo | Valor |
|----------|-------|
| **HTTP Method** | `POST` |
| **Endpoint** | `https://{host}/rest/api/3/issue` |
| **Headers** | `Authorization: Basic base64(email:token)`, `Accept: application/json`, `Content-Type: application/json` |
| **Documentación** | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-post |

### Manejo de Errores Específicos

| Escenario | Condición | Mensaje al agente |
|-----------|-----------|-------------------|
| Proyecto no existe | HTTP 404 | `"Project '{projectKey}' not found. Verify the project key."` |
| Tipo de issue inválido | HTTP 400 | `"Invalid issue type '{issueType}' for project '{projectKey}'. Available types: ..."` |
| Campos requeridos faltantes | HTTP 400 | `"Missing required fields: {fields}. Check the project's field configuration."` |
| Subtask sin parentKey | Validación Zod | `"parentKey is required when issueType is 'Subtask'."` |
| Epic sin epicName | Validación Zod | `"epicName is required when issueType is 'Epic'."` |
| Rate limit | HTTP 429 | Backoff exponencial, máx 3 reintentos |

### Ejemplo de Uso

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "create_issue",
    "arguments": {
      "projectKey": "PROJ",
      "summary": "Login crash on v2.3 when clicking submit",
      "issueType": "Bug",
      "description": "The application crashes with a NullPointerException when the user clicks the Login button on the v2.3 dashboard.",
      "priority": "High",
      "labels": ["login", "crash"],
      "assignee": "712020:abc-123-def"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"key\":\"PROJ-151\",\"id\":\"10151\",\"url\":\"https://my-company.atlassian.net/browse/PROJ-151\",\"summary\":\"Login crash on v2.3 when clicking submit\",\"issueType\":\"Bug\",\"status\":\"To Do\"}"
    }]
  }
}
```

---

## Tool-03: `update_issue`

### Definición

| Campo | Valor |
|-------|-------|
| **name** | `update_issue` |
| **description** | Update editable fields of an existing issue. You can modify: summary, description, priority, labels, components, and custom fields. To change the issue status, use transition_issue instead. At least one field besides issueKey must be provided. Labels and components completely replace existing values. |

### Schema de Entrada (Zod)

```typescript
export const UpdateIssueInputSchema = z.object({
  issueKey: z.string()
    .min(1)
    .describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
  summary: z.string()
    .min(1).max(255)
    .optional()
    .describe('New summary for the issue.'),
  description: z.string()
    .optional()
    .describe('New description. Supports Jira markdown and ADF.'),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest'])
    .optional()
    .describe('New priority level.'),
  labels: z.array(z.string())
    .optional()
    .describe('New labels. REPLACES all existing labels.'),
  components: z.array(z.string())
    .optional()
    .describe('New components. REPLACES all existing components.'),
  customFields: z.record(z.string(), z.unknown())
    .optional()
    .describe('Custom field updates.'),
}).refine(
  (data) => Object.keys(data).some(k => k !== 'issueKey' && data[k as keyof typeof data] !== undefined),
  { message: 'At least one field to update must be provided besides issueKey.' }
);

export type UpdateIssueInput = z.infer<typeof UpdateIssueInputSchema>;
```

### Schema de Salida

```typescript
export const UpdateIssueOutputSchema = z.object({
  key: z.string().describe('Updated issue key.'),
  updated: z.boolean().describe('Whether the update was applied successfully.'),
  changedFields: z.array(z.string()).describe('List of fields that were modified.'),
  url: z.string().describe('Direct link to the issue in Jira.'),
});

export type UpdateIssueOutput = z.infer<typeof UpdateIssueOutputSchema>;
```

### Mapeo a API Jira

| Atributo | Valor |
|----------|-------|
| **HTTP Method** | `PUT` |
| **Endpoint** | `https://{host}/rest/api/3/issue/{issueIdOrKey}` |
| **Headers** | `Authorization: Basic base64(email:token)`, `Accept: application/json`, `Content-Type: application/json` |
| **Body** | `{ "fields": { "summary": "...", "priority": { "name": "High" }, ... } }` |
| **Response** | HTTP 204 No Content (sin body) |
| **Documentación** | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put |

### Manejo de Errores Específicos

| Escenario | Condición | Mensaje al agente |
|-----------|-----------|-------------------|
| Issue no existe | HTTP 404 | `"Issue '{issueKey}' not found."` |
| Campo no editable | HTTP 400 | `"Field '{field}' cannot be edited in the current status. Consider using transition_issue for status changes."` |
| Sin campos a modificar | Validación Zod | `"At least one field to update must be provided besides issueKey."` |
| Permisos insuficientes | HTTP 403 | `"You do not have permission to edit issue '{issueKey}'."` |

### Ejemplo de Uso

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "update_issue",
    "arguments": {
      "issueKey": "PROJ-151",
      "summary": "Login crash on v2.3.1 when clicking submit button",
      "priority": "Highest",
      "labels": ["login", "crash", "critical"]
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"key\":\"PROJ-151\",\"updated\":true,\"changedFields\":[\"summary\",\"priority\",\"labels\"],\"url\":\"https://my-company.atlassian.net/browse/PROJ-151\"}"
    }]
  }
}
```

---

## Tool-04: `transition_issue`

### Definición

| Campo | Valor |
|-------|-------|
| **name** | `transition_issue` |
| **description** | Transition an issue through its workflow. You can either execute a transition by name or ID, or list all available transitions from the current state. Some transitions require a resolution (e.g., "Done" may require "Fixed", "Won't Fix", etc.). Use listTransitions=true to discover what transitions are available before attempting one. |

### Schema de Entrada (Zod)

```typescript
export const TransitionIssueInputSchema = z.object({
  issueKey: z.string()
    .min(1)
    .describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
  transitionName: z.string()
    .optional()
    .describe('Human-readable transition name (e.g., "In Progress", "Done", "Start Progress").'),
  transitionId: z.string()
    .optional()
    .describe('Numeric transition ID. Use if transition name is ambiguous or not found.'),
  resolution: z.string()
    .optional()
    .describe('Resolution name. Required for some transitions (e.g., "Done", "Fixed", "Won\'t Fix").'),
  comment: z.string()
    .optional()
    .describe('Optional comment to add during the transition.'),
  listTransitions: z.boolean()
    .default(false)
    .describe('If true, only lists available transitions without executing one.'),
}).refine(
  (data) => data.listTransitions || data.transitionName || data.transitionId,
  { message: 'Either transitionName, transitionId, or listTransitions=true must be provided.' }
);

export type TransitionIssueInput = z.infer<typeof TransitionIssueInputSchema>;
```

### Schema de Salida

```typescript
export const TransitionIssueOutputSchema = z.object({
  key: z.string().describe('Issue key.'),
  transitioned: z.boolean().describe('Whether a transition was executed.'),
  fromStatus: z.string().optional().describe('Previous status (if transition executed).'),
  toStatus: z.string().optional().describe('New status after transition (if executed).'),
  url: z.string().describe('Direct link to the issue.'),
  availableTransitions: z.array(z.object({
    id: z.string().describe('Transition ID.'),
    name: z.string().describe('Transition name.'),
    toStatus: z.string().describe('Target status after this transition.'),
  })).optional().describe('List of available transitions. Always populated when listTransitions=true. Also populated if a transition fails.'),
});

export type TransitionIssueOutput = z.infer<typeof TransitionIssueOutputSchema>;
```

### Mapeo a API Jira

| Atributo | Valor |
|----------|-------|
| **Listar transiciones** | `GET https://{host}/rest/api/3/issue/{issueIdOrKey}/transitions` |
| **Ejecutar transición** | `POST https://{host}/rest/api/3/issue/{issueIdOrKey}/transitions` |
| **Body (ejecutar)** | `{ "transition": { "id": "21" }, "fields": { "resolution": { "name": "Fixed" } }, "update": { "comment": [{ "add": { "body": "..." } }] } }` |
| **Documentación** | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-post |

### Resolución de Transición por Nombre

```typescript
async function resolveTransitionId(
  jiraClient: JiraClient,
  issueKey: string,
  transitionName: string
): Promise<{ id: string; name: string; toStatus: string } | null> {
  const transitions = await jiraClient.getTransitions(issueKey);
  const matches = transitions.filter(t =>
    t.name.toLowerCase() === transitionName.toLowerCase() ||
    t.toStatus.toLowerCase() === transitionName.toLowerCase()
  );

  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) return null; // Ambigua — el handler informará
  return null; // No encontrada
}
```

### Manejo de Errores Específicos

| Escenario | Condición | Mensaje al agente |
|-----------|-----------|-------------------|
| Issue no existe | HTTP 404 | `"Issue '{issueKey}' not found."` |
| Transición no disponible | HTTP 400 | `"Transition '{name}' is not available from current status '{status}'. Available transitions: {list}"` |
| Nombre ambiguo | Múltiples matches | `"Multiple transitions match '{name}'. Use transitionId instead. Options: {list}"` |
| Resolución requerida | HTTP 400 | `"This transition requires a resolution. Provide a resolution field (e.g., 'Fixed', 'Done')."` |
| listTransitions | N/A | Devuelve las transiciones disponibles sin ejecutar ninguna |

### Ejemplo de Uso — Listar

**Request:**
```json
{
  "jsonrpc": "2.0", "id": 8, "method": "tools/call",
  "params": { "name": "transition_issue", "arguments": { "issueKey": "PROJ-151", "listTransitions": true } }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0", "id": 8,
  "result": { "content": [{ "type": "text", "text": "{\"key\":\"PROJ-151\",\"transitioned\":false,\"url\":\"...\",\"availableTransitions\":[{\"id\":\"11\",\"name\":\"Start Progress\",\"toStatus\":\"In Progress\"},{\"id\":\"21\",\"name\":\"Done\",\"toStatus\":\"Done\"}]}" }] }
}
```

---

## Tool-05: `get_sprints`

### Definición

| Campo | Valor |
|-------|-------|
| **name** | `get_sprints` |
| **description** | Get sprints from a Jira board. You can specify a boardId directly or provide a boardName to look it up. Filter sprints by state: active, future, or closed. Optionally include the issues within each sprint. Use this to see what work is planned or in progress for a team. |

### Schema de Entrada (Zod)

```typescript
export const GetSprintsInputSchema = z.object({
  boardId: z.number().int().positive()
    .optional()
    .describe('Numeric board ID (e.g., 42). Alternative to boardName.'),
  boardName: z.string()
    .optional()
    .describe('Board name to look up (e.g., "PROJ Scrum Board"). Alternative to boardId.'),
  state: z.enum(['active', 'future', 'closed'])
    .default('active')
    .describe('Sprint state filter. Default: "active".'),
  includeIssues: z.boolean()
    .default(false)
    .describe('If true, includes issues within each sprint in the response.'),
  startAt: z.number().int().min(0)
    .default(0)
    .describe('Pagination offset.'),
  maxResults: z.number().int().min(1).max(50)
    .default(50)
    .describe('Max sprints to return.'),
}).refine(
  (data) => data.boardId !== undefined || data.boardName !== undefined,
  { message: 'Either boardId or boardName must be provided.' }
);

export type GetSprintsInput = z.infer<typeof GetSprintsInputSchema>;
```

### Resolución de Board por Nombre

```typescript
async function resolveBoardId(
  jiraClient: JiraClient,
  boardName: string
): Promise<{ id: number; name: string } | null> {
  const response = await jiraClient.get(`/rest/agile/1.0/board`, {
    name: boardName,
  });
  const boards = response.values;
  if (boards.length === 0) return null;

  const exact = boards.find((b: any) => b.name.toLowerCase() === boardName.toLowerCase());
  return exact ? { id: exact.id, name: exact.name } : { id: boards[0].id, name: boards[0].name };
}
```

### Schema de Salida

```typescript
export const GetSprintsOutputSchema = z.object({
  boardId: z.number().int().describe('Board ID used for the query.'),
  boardName: z.string().describe('Board name.'),
  total: z.number().int().describe('Total sprints matching the filter.'),
  sprints: z.array(z.object({
    id: z.number().int().describe('Sprint ID.'),
    name: z.string().describe('Sprint name.'),
    state: z.string().describe('Sprint state: active, future, closed.'),
    goal: z.string().optional().describe('Sprint goal.'),
    startDate: z.string().optional().describe('Sprint start date (ISO 8601).'),
    endDate: z.string().optional().describe('Sprint end date (ISO 8601).'),
    issueCount: z.number().int().describe('Number of issues in the sprint.'),
    issues: z.array(z.object({
      key: z.string(),
      summary: z.string(),
      issueType: z.string(),
      status: z.string(),
      assignee: z.string().optional(),
    })).optional().describe('Issues in the sprint (only present if includeIssues=true).'),
  })),
});

export type GetSprintsOutput = z.infer<typeof GetSprintsOutputSchema>;
```

### Mapeo a API Jira

| Atributo | Valor |
|----------|-------|
| **Buscar board** | `GET https://{host}/rest/agile/1.0/board?name={boardName}` |
| **Listar sprints** | `GET https://{host}/rest/agile/1.0/board/{boardId}/sprint?state={state}&startAt={startAt}&maxResults={maxResults}` |
| **Issues del sprint** | `GET https://{host}/rest/agile/1.0/sprint/{sprintId}/issue` (solo si `includeIssues=true`) |
| **Documentación** | https://developer.atlassian.com/cloud/jira/software/rest/ |

### Manejo de Errores Específicos

| Escenario | Condición | Mensaje al agente |
|-----------|-----------|-------------------|
| Board no encontrado | HTTP 404 | `"Board '{name|id}' not found. Verify the board name or ID."` |
| Sin sprints | Respuesta vacía | `"No {state} sprints found for board '{boardName}'."` |
| Sin permisos | HTTP 403 | `"You do not have access to board '{boardName}'."` |

### Ejemplo de Uso

**Request:**
```json
{
  "jsonrpc": "2.0", "id": 9, "method": "tools/call",
  "params": { "name": "get_sprints", "arguments": { "boardName": "PROJ Scrum Board", "state": "active", "includeIssues": true } }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0", "id": 9,
  "result": { "content": [{ "type": "text", "text": "{\"boardId\":42,\"boardName\":\"PROJ Scrum Board\",\"total\":1,\"sprints\":[{\"id\":101,\"name\":\"Sprint 12\",\"state\":\"active\",\"goal\":\"Deliver auth module\",\"startDate\":\"2026-06-01\",\"endDate\":\"2026-06-15\",\"issueCount\":8,\"issues\":[...]}]}" }] }
}
```

---

## Tool-06: `assign_user`

### Definición

| Campo | Valor |
|-------|-------|
| **name** | `assign_user` |
| **description** | Assign a user to an issue or unassign the current user. Provide the issue key and the account ID of the user to assign. To unassign, use accountId: null or accountId: "unassigned". The assignee must have access to the issue's project. |

### Schema de Entrada (Zod)

```typescript
export const AssignUserInputSchema = z.object({
  issueKey: z.string()
    .min(1)
    .describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
  accountId: z.string()
    .nullable()
    .describe('Atlassian Account ID of the user to assign. Use null or "unassigned" to unassign. REQUIRED.'),
});

export type AssignUserInput = z.infer<typeof AssignUserInputSchema>;
```

### Schema de Salida

```typescript
export const AssignUserOutputSchema = z.object({
  key: z.string().describe('Issue key.'),
  assignee: z.object({
    accountId: z.string().describe('Account ID of the assignee.'),
    displayName: z.string().describe('Full display name.'),
    emailAddress: z.string().optional().describe('Email (may be empty due to Jira privacy settings).'),
  }).nullable().describe('Current assignee. null if unassigned.'),
  url: z.string().describe('Direct link to the issue.'),
});

export type AssignUserOutput = z.infer<typeof AssignUserOutputSchema>;
```

### Mapeo a API Jira

| Operación | HTTP Method | Endpoint | Body |
|-----------|-------------|----------|------|
| **Asignar** | `PUT` | `/rest/api/3/issue/{issueIdOrKey}/assignee` | `{ "accountId": "712020:abc-123" }` |
| **Desasignar** | `PUT` | `/rest/api/3/issue/{issueIdOrKey}/assignee` | `{ "accountId": null }` o `PUT /rest/api/3/issue/{issueIdOrKey}` con `{ "fields": { "assignee": null } }` |
| **Documentación** | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-assignee-put |

### Manejo de Errores Específicos

| Escenario | Condición | Mensaje al agente |
|-----------|-----------|-------------------|
| Issue no existe | HTTP 404 | `"Issue '{issueKey}' not found."` |
| Usuario no encontrado | HTTP 400/404 | `"User with accountId '{accountId}' not found. Verify the account ID."` |
| Usuario sin permisos | HTTP 400 | `"User '{accountId}' does not have access to the project of issue '{issueKey}'."` |
| Desasignar | `accountId: null` | Respuesta normal con `assignee: null`. |

### Ejemplo de Uso

**Request:**
```json
{
  "jsonrpc": "2.0", "id": 10, "method": "tools/call",
  "params": { "name": "assign_user", "arguments": { "issueKey": "PROJ-151", "accountId": "712020:abc-123-def" } }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0", "id": 10,
  "result": { "content": [{ "type": "text", "text": "{\"key\":\"PROJ-151\",\"assignee\":{\"accountId\":\"712020:abc-123-def\",\"displayName\":\"John Doe\",\"emailAddress\":\"john@company.com\"},\"url\":\"https://my-company.atlassian.net/browse/PROJ-151\"}" }] }
}
```

---

## Tool-07: `manage_comments`

### Definición

| Campo | Valor |
|-------|-------|
| **name** | `manage_comments` |
| **description** | Manage comments on a Jira issue. Use action "list" to read all comments, or action "add" to create a new comment. Comments support Jira markdown syntax including @mentions. When adding, the body field is required. The list action supports pagination. |

### Schema de Entrada (Zod)

```typescript
export const ManageCommentsInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list'),
    issueKey: z.string().min(1).describe('Issue key. REQUIRED.'),
    startAt: z.number().int().min(0).default(0).describe('Pagination offset.'),
    maxResults: z.number().int().min(1).max(100).default(50).describe('Max comments to return.'),
  }),
  z.object({
    action: z.literal('add'),
    issueKey: z.string().min(1).describe('Issue key. REQUIRED.'),
    body: z.string().min(1).describe('Comment text. Supports Jira markdown. REQUIRED.'),
  }),
]);

export type ManageCommentsInput = z.infer<typeof ManageCommentsInputSchema>;
```

### Schema de Salida — `list`

```typescript
export const CommentsListOutputSchema = z.object({
  issueKey: z.string(),
  total: z.number().int().describe('Total number of comments.'),
  startAt: z.number().int(),
  maxResults: z.number().int(),
  comments: z.array(z.object({
    id: z.string().describe('Comment ID.'),
    author: z.string().describe('Author display name.'),
    body: z.string().describe('Comment body text.'),
    created: z.string().describe('ISO 8601 creation date.'),
    updated: z.string().describe('ISO 8601 last update date.'),
  })),
});

export type CommentsListOutput = z.infer<typeof CommentsListOutputSchema>;
```

### Schema de Salida — `add`

```typescript
export const CommentAddOutputSchema = z.object({
  issueKey: z.string(),
  commentId: z.string().describe('Created comment ID.'),
  author: z.string().describe('Author display name (the authenticated user).'),
  body: z.string().describe('Comment body as created.'),
  created: z.string().describe('ISO 8601 creation date.'),
  url: z.string().describe('Direct link to the issue.'),
});

export type CommentAddOutput = z.infer<typeof CommentAddOutputSchema>;
```

### Mapeo a API Jira

| Acción | HTTP Method | Endpoint | Body |
|--------|-------------|----------|------|
| **list** | `GET` | `/rest/api/3/issue/{issueIdOrKey}/comment?startAt={0}&maxResults={50}` | — |
| **add** | `POST` | `/rest/api/3/issue/{issueIdOrKey}/comment` | `{ "body": { "type": "doc", "version": 1, "content": [...] } }` |
| **Documentación** | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/ |

### Manejo de Errores Específicos

| Escenario | Condición | Mensaje al agente |
|-----------|-----------|-------------------|
| Issue no existe | HTTP 404 | `"Issue '{issueKey}' not found."` |
| Comentario vacío | Validación Zod | `"Comment body cannot be empty."` |
| Sin comentarios | list con total=0 | Respuesta normal con `comments: []`. |
| Permisos insuficientes | HTTP 403 | `"You do not have permission to comment on issue '{issueKey}'."` |

### Ejemplo de Uso — `add`

**Request:**
```json
{
  "jsonrpc": "2.0", "id": 11, "method": "tools/call",
  "params": { "name": "manage_comments", "arguments": { "action": "add", "issueKey": "PROJ-151", "body": "Fixed in PR #4521. The issue was a null check missing in the auth flow." } }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0", "id": 11,
  "result": { "content": [{ "type": "text", "text": "{\"issueKey\":\"PROJ-151\",\"commentId\":\"10201\",\"author\":\"John Doe\",\"body\":\"Fixed in PR #4521...\",\"created\":\"2026-06-13T15:30:00Z\",\"url\":\"https://my-company.atlassian.net/browse/PROJ-151\"}" }] }
}
```

---

## Tool-08: `attach_file`

### Definición

| Campo | Valor |
|-------|-------|
| **name** | `attach_file` |
| **description** | Attach a local file to a Jira issue. Provide the issue key and the absolute or relative path to the file on the local filesystem. The file must exist and be readable. Maximum file size is 10 MB (Jira Cloud limit). Common file types are supported: images, PDFs, documents, logs. Returns attachment metadata including filename, size, MIME type, and URL. |

### Schema de Entrada (Zod)

```typescript
import { z } from 'zod';
import { existsSync, statSync } from 'fs';
import { resolve, isAbsolute } from 'path';

export const AttachFileInputSchema = z.object({
  issueKey: z.string()
    .min(1)
    .describe('Issue key (e.g., "PROJ-123"). REQUIRED.'),
  filePath: z.string()
    .min(1)
    .describe('Absolute or relative path to the file. REQUIRED.')
    .refine((path) => {
      const absolutePath = isAbsolute(path) ? path : resolve(process.cwd(), path);
      if (!existsSync(absolutePath)) return false;
      const stats = statSync(absolutePath);
      if (!stats.isFile()) return false;
      if (stats.size > 10 * 1024 * 1024) return false; // 10 MB
      return true;
    }, {
      message: 'File must exist, be readable, and be less than 10 MB in size.',
    }),
});

export type AttachFileInput = z.infer<typeof AttachFileInputSchema>;
```

### Validaciones Pre-Handler

```typescript
function validateFile(filePath: string): { valid: boolean; error?: string; absolutePath?: string; size?: number } {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);

  if (!existsSync(absolutePath)) {
    return { valid: false, error: `File not found at path: "${filePath}". Resolved to: "${absolutePath}".` };
  }

  const stats = statSync(absolutePath);
  if (!stats.isFile()) {
    return { valid: false, error: `Path "${filePath}" is not a file.` };
  }

  if (stats.size > 10 * 1024 * 1024) {
    return { valid: false, error: `File size (${(stats.size / 1024 / 1024).toFixed(1)} MB) exceeds Jira Cloud limit (10 MB).` };
  }

  return { valid: true, absolutePath, size: stats.size };
}
```

### Construcción del Multipart Form

```typescript
import { readFileSync } from 'fs';
import { basename } from 'path';

async function buildFormData(filePath: string): Promise<{ formData: FormData; filename: string; mimeType: string }> {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  const filename = basename(absolutePath);
  const fileBuffer = readFileSync(absolutePath);
  const mimeType = detectMimeType(filename);

  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: mimeType }), filename);

  return { formData, filename, mimeType };
}
```

### Schema de Salida

```typescript
export const AttachFileOutputSchema = z.object({
  issueKey: z.string(),
  attachment: z.object({
    id: z.string().describe('Attachment ID.'),
    filename: z.string().describe('Original filename.'),
    size: z.number().int().describe('File size in bytes.'),
    mimeType: z.string().describe('MIME type of the file.'),
    created: z.string().describe('ISO 8601 creation date.'),
    url: z.string().describe('Direct URL to the attachment in Jira.'),
  }),
});

export type AttachFileOutput = z.infer<typeof AttachFileOutputSchema>;
```

### Mapeo a API Jira

| Atributo | Valor |
|----------|-------|
| **HTTP Method** | `POST` |
| **Endpoint** | `https://{host}/rest/api/3/issue/{issueIdOrKey}/attachments` |
| **Headers** | `Authorization: Basic base64(email:token)`, `X-Atlassian-Token: no-check`, `Content-Type: multipart/form-data` |
| **Body** | `FormData` con campo `file` |
| **Nota** | El header `X-Atlassian-Token: no-check` es requerido para bypassar la protección CSRF cuando se usa API Token |
| **Documentación** | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/ |

### Manejo de Errores Específicos

| Escenario | Condición | Mensaje al agente |
|-----------|-----------|-------------------|
| Archivo no encontrado | Validación Zod | `"File not found at path: '{filePath}'. Resolved to: '{absolutePath}'."` |
| Archivo excede tamaño | Validación Zod | `"File size (X.X MB) exceeds Jira Cloud limit (10 MB)."` |
| Issue no encontrado | HTTP 404 | `"Issue '{issueKey}' not found."` |
| Sin permisos | HTTP 403 | `"You do not have permission to attach files to issue '{issueKey}'."` |
| Tipo MIME rechazado | HTTP 400 | `"Jira rejected the file type '{mimeType}'. Verify the file format is supported."` |

### Ejemplo de Uso

**Request:**
```json
{
  "jsonrpc": "2.0", "id": 12, "method": "tools/call",
  "params": { "name": "attach_file", "arguments": { "issueKey": "PROJ-151", "filePath": "./logs/crash-report.txt" } }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0", "id": 12,
  "result": { "content": [{ "type": "text", "text": "{\"issueKey\":\"PROJ-151\",\"attachment\":{\"id\":\"30201\",\"filename\":\"crash-report.txt\",\"size\":15420,\"mimeType\":\"text/plain\",\"created\":\"2026-06-13T16:00:00Z\",\"url\":\"https://my-company.atlassian.net/secure/attachment/30201/crash-report.txt\"}}" }] }
}
```

---

## Tool-09: `jira_health_check`

### Definición

| Campo | Valor |
|-------|-------|
| **name** | `jira_health_check` |
| **description** | Verify connectivity to Jira Cloud and validate the current authentication credentials. Makes a lightweight call to the Jira API to confirm the host, email, and API token are correctly configured. Returns the authenticated user's identity and Jira instance information. Use this to diagnose connection issues before running other tools. |

### Schema de Entrada (Zod)

```typescript
export const HealthCheckInputSchema = z.object({}).strict();
// No requiere argumentos

export type HealthCheckInput = z.infer<typeof HealthCheckInputSchema>;
```

### Schema de Salida

```typescript
export const HealthCheckOutputSchema = z.object({
  status: z.enum(['connected', 'error']).describe('Connection status.'),
  user: z.object({
    accountId: z.string().describe('Authenticated user account ID.'),
    displayName: z.string().describe('User display name.'),
    emailAddress: z.string().optional().describe('Email address (may be empty due to privacy settings).'),
  }).optional().describe('Authenticated user info. Present when status="connected".'),
  jiraHost: z.string().describe('Jira host being connected to.'),
  timestamp: z.string().describe('ISO 8601 timestamp of the check.'),
  error: z.string().optional().describe('Error message. Present when status="error".'),
});

export type HealthCheckOutput = z.infer<typeof HealthCheckOutputSchema>;
```

### Mapeo a API Jira

| Atributo | Valor |
|----------|-------|
| **HTTP Method** | `GET` |
| **Endpoint** | `https://{host}/rest/api/3/myself` |
| **Headers** | `Authorization: Basic base64(email:token)`, `Accept: application/json` |
| **Documentación** | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-users/#api-rest-api-3-myself-get |

### Manejo de Errores Específicos

| Escenario | Condición | Mensaje al agente |
|-----------|-----------|-------------------|
| Éxito | HTTP 200 | `status: "connected"` con datos del usuario |
| Auth fallida | HTTP 401 | `status: "error"`, `error: "Authentication failed. Verify JIRA_EMAIL and JIRA_API_TOKEN. Generate a new token at https://id.atlassian.com/manage/api-tokens"` |
| Host inaccesible | Network error | `status: "error"`, `error: "Could not connect to {JIRA_HOST}. Verify JIRA_HOST and network connectivity."` |
| Timeout | > 15s | `status: "error"`, `error: "Connection to {JIRA_HOST} timed out after 15 seconds."` |

### Ejemplo de Uso

**Request:**
```json
{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "jira_health_check", "arguments": {} }
}
```

**Response (success):**
```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": { "content": [{ "type": "text", "text": "{\"status\":\"connected\",\"user\":{\"accountId\":\"712020:abc-123-def\",\"displayName\":\"John Doe\",\"emailAddress\":\"john@company.com\"},\"jiraHost\":\"my-company.atlassian.net\",\"timestamp\":\"2026-06-13T14:00:00Z\"}" }] }
}
```

**Response (error):**
```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": { "content": [{ "type": "text", "text": "{\"status\":\"error\",\"jiraHost\":\"my-company.atlassian.net\",\"timestamp\":\"2026-06-13T14:00:01Z\",\"error\":\"Authentication failed. Verify JIRA_EMAIL and JIRA_API_TOKEN.\"}" }], "isError": true }
}
```

---

## Matriz de Trazabilidad Tool → API Jira

| # | Tool MCP | Método HTTP | Endpoint Jira | Rate Limit Impact |
|---|----------|-------------|---------------|-------------------|
| 1 | `search_issues` | POST | `/rest/api/3/search` | Alto (JQL puede ser costoso) |
| 2 | `create_issue` | POST | `/rest/api/3/issue` | Bajo (1 request) |
| 3 | `update_issue` | PUT | `/rest/api/3/issue/{key}` | Bajo (1 request) |
| 4 | `transition_issue` | GET + POST | `/rest/api/3/issue/{key}/transitions` | Medio (2 requests si se busca por nombre) |
| 5 | `get_sprints` | GET x N | `/rest/agile/1.0/board/{id}/sprint` | Medio-Alto (N depende de `includeIssues`) |
| 6 | `assign_user` | PUT | `/rest/api/3/issue/{key}/assignee` | Bajo (1 request) |
| 7 | `manage_comments` | GET o POST | `/rest/api/3/issue/{key}/comment` | Bajo (1 request) |
| 8 | `attach_file` | POST | `/rest/api/3/issue/{key}/attachments` | Bajo (1 request) |
| 9 | `jira_health_check` | GET | `/rest/api/3/myself` | Mínimo (request ligero) |

---

## Registro de Tools en el MCP Server

```typescript
// src/tools/register.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchIssues } from './search-issues.js';
import { registerCreateIssue } from './create-issue.js';
import { registerUpdateIssue } from './update-issue.js';
import { registerTransitionIssue } from './transition-issue.js';
import { registerGetSprints } from './get-sprints.js';
import { registerAssignUser } from './assign-user.js';
import { registerManageComments } from './manage-comments.js';
import { registerAttachFile } from './attach-file.js';
import { registerHealthCheck } from './health-check.js';
import type { JiraClient } from '../client/jira-client.js';
import type { JiraConfig } from '../types/index.js';

export function registerAllTools(
  server: McpServer,
  jiraClient: JiraClient,
  config: JiraConfig
): void {
  registerSearchIssues(server, jiraClient);
  registerCreateIssue(server, jiraClient, config);
  registerUpdateIssue(server, jiraClient);
  registerTransitionIssue(server, jiraClient);
  registerGetSprints(server, jiraClient);
  registerAssignUser(server, jiraClient);
  registerManageComments(server, jiraClient);
  registerAttachFile(server, jiraClient);
  registerHealthCheck(server, jiraClient, config);
}
```

---

## Referencias

| Recurso | URL |
|---------|-----|
| MCP TypeScript SDK — Tool Registration | https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/server/mcp.ts |
| Zod to JSON Schema | https://zod.dev/?id=json-schema |
| Jira Cloud REST API v3 Reference | https://developer.atlassian.com/cloud/jira/platform/rest/v3/ |
| Jira Agile API Reference | https://developer.atlassian.com/cloud/jira/software/rest/ |
