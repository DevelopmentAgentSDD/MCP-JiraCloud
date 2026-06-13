# Use Cases — opencode-jira-mcp

> **Proyecto:** opencode-jira-mcp  
> **Tipo:** MCP Server para Jira Cloud  
> **Versión:** MVP v1.0.0  
> **Fecha:** 2026-06-13  

---

## Convenciones

- **Actor primario:** opencode AI agent (invoca el MCP vía stdio)
- **Sistema:** opencode-jira-mcp → Jira Cloud REST API v3
- **Precondición:** MCP Server iniciado, variables de entorno configuradas, token válido
- **Notación de schemas:** JSON Schema (Zod en implementación)

---

## UC-01: Buscar Issues con JQL

| Atributo | Valor |
|----------|-------|
| **ID** | UC-01 |
| **Tool MCP** | `search_issues` |
| **Actor** | opencode agent |
| **Descripción** | El agente busca issues en Jira usando JQL con filtros, paginación y selección de campos. |
| **Precondición** | Conexión a Jira establecida. El agente conoce el proyecto o criterios de búsqueda. |
| **Postcondición** | Se devuelve una lista paginada de issues que coinciden con la consulta. |

### Flujo Principal

1. El agente invoca `search_issues` con parámetros de búsqueda
2. El MCP valida el schema de entrada (Zod)
3. El MCP construye la query JQL a partir de los parámetros estructurados
4. El MCP llama a `POST /rest/api/3/search` con el body JQL + paginación
5. Jira devuelve la lista de issues
6. El MCP formatea la respuesta (campos seleccionados, total, paginación)
7. El MCP devuelve el resultado al agente

### Flujos Alternativos

| Escenario | Manejo |
|-----------|--------|
| **JQL inválido** | Jira devuelve 400 → MCP traduce el mensaje de error y lo retorna al agente |
| **Sin resultados** | Respuesta con `total: 0` e `issues: []` |
| **Rate limit** | Jira devuelve 429 → MCP aplica backoff exponencial y reintenta (máx 3 intentos) |
| **Timeout** | Si Jira no responde en 30s, el MCP devuelve error de timeout |
| **Proyecto/sprint no existe** | Jira devuelve 404 → MCP retorna mensaje claro |

### Schema de Entrada

```json
{
  "jql": { "type": "string", "description": "JQL query string. If omitted, filters below are used." },
  "projectKey": { "type": "string", "description": "Project key (e.g., 'PROJ')" },
  "issueType": { "type": "string", "enum": ["Task", "Bug", "Story", "Epic", "Subtask"] },
  "status": { "type": "string", "description": "Status name (e.g., 'In Progress')" },
  "assignee": { "type": "string", "description": "Account ID or 'currentUser()' or 'unassigned'" },
  "priority": { "type": "string", "enum": ["Highest", "High", "Medium", "Low", "Lowest"] },
  "labels": { "type": "array", "items": { "type": "string" } },
  "sprint": { "type": "string", "description": "Sprint name or ID" },
  "text": { "type": "string", "description": "Free-text search in summary and description" },
  "startAt": { "type": "integer", "default": 0 },
  "maxResults": { "type": "integer", "default": 50, "maximum": 100 },
  "orderBy": { "type": "string", "description": "Field name + ASC/DESC (e.g., 'created DESC')" },
  "fields": { "type": "array", "items": { "type": "string" }, "description": "Fields to include in response" }
}
```

### Schema de Salida

```json
{
  "total": { "type": "integer", "description": "Total matching issues" },
  "startAt": { "type": "integer" },
  "maxResults": { "type": "integer" },
  "issues": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "key": { "type": "string" },
        "id": { "type": "string" },
        "summary": { "type": "string" },
        "issueType": { "type": "string" },
        "status": { "type": "string" },
        "priority": { "type": "string" },
        "assignee": { "type": "string" },
        "created": { "type": "string", "format": "date-time" },
        "updated": { "type": "string", "format": "date-time" },
        "url": { "type": "string", "format": "uri" }
      }
    }
  }
}
```

### Mapeo a API Jira

- **Endpoint:** `POST /rest/api/3/search`
- **Documentación:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/

---

## UC-02: Crear Issue

| Atributo | Valor |
|----------|-------|
| **ID** | UC-02 |
| **Tool MCP** | `create_issue` |
| **Actor** | opencode agent |
| **Descripción** | El agente crea un nuevo issue en Jira con tipo, resumen, descripción y campos opcionales. |
| **Precondición** | El proyecto existe y el usuario tiene permiso `CREATE_ISSUES`. |
| **Postcondición** | El issue queda creado en Jira con key asignada. |

### Flujo Principal

1. El agente invoca `create_issue` con los campos requeridos y opcionales
2. El MCP valida campos obligatorios (`projectKey`, `summary`, `issueType`)
3. El MCP mapea `issueType` legible → `issuetype.id` mediante consulta de metadatos del proyecto
4. El MCP construye el payload para `POST /rest/api/3/issue`
5. Jira crea el issue y devuelve key, id y URL
6. El MCP formatea la respuesta y la devuelve al agente

### Flujos Alternativos

| Escenario | Manejo |
|-----------|--------|
| **Proyecto no existe** | 404 → mensaje: "Project 'XXX' not found. Verify the project key." |
| **Tipo de issue inválido** | 400 → el MCP lista los tipos disponibles para ese proyecto |
| **Campo obligatorio faltante** | 400 → el MCP informa qué campos son requeridos según la configuración del proyecto |
| **Usuario asignado no existe** | 400 → mensaje claro con sugerencia de usar `search_issues` para encontrar usuarios |
| **Nombre de Epic duplicado** | 201 (Jira no valida unicidad de nombre) — se crea de todas formas |
| **Rate limit** | 429 → backoff exponencial, máx 3 reintentos |

### Schema de Entrada

```json
{
  "projectKey": { "type": "string", "description": "Project key (e.g., 'PROJ'). REQUIRED." },
  "summary": { "type": "string", "description": "Issue title. REQUIRED." },
  "issueType": { "type": "string", "enum": ["Task", "Bug", "Story", "Epic", "Subtask"], "description": "REQUIRED." },
  "description": { "type": "string", "description": "Issue description (supports Jira markdown/Atlassian Document Format)" },
  "priority": { "type": "string", "enum": ["Highest", "High", "Medium", "Low", "Lowest"] },
  "assignee": { "type": "string", "description": "Account ID of the assignee" },
  "labels": { "type": "array", "items": { "type": "string" } },
  "components": { "type": "array", "items": { "type": "string" }, "description": "Component names" },
  "sprint": { "type": "string", "description": "Sprint ID or name to add the issue to" },
  "parentKey": { "type": "string", "description": "Parent issue key (required for Subtask)" },
  "epicLink": { "type": "string", "description": "Epic issue key to link (for Story, Task, Bug)" },
  "customFields": {
    "type": "object",
    "description": "Map of custom field IDs to values (e.g., { 'customfield_10014': 'value' })"
  }
}
```

### Schema de Salida

```json
{
  "key": { "type": "string", "description": "Issue key (e.g., 'PROJ-123')" },
  "id": { "type": "string", "description": "Numeric issue ID" },
  "url": { "type": "string", "format": "uri", "description": "Direct link to the issue in Jira" },
  "summary": { "type": "string" },
  "issueType": { "type": "string" },
  "status": { "type": "string" }
}
```

### Mapeo a API Jira

- **Endpoint:** `POST /rest/api/3/issue`
- **Documentación:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-post

---

## UC-03: Actualizar Issue

| Atributo | Valor |
|----------|-------|
| **ID** | UC-03 |
| **Tool MCP** | `update_issue` |
| **Actor** | opencode agent |
| **Descripción** | El agente modifica campos editables de un issue existente. |
| **Precondición** | El issue existe y el usuario tiene permiso `EDIT_ISSUES`. |
| **Postcondición** | Los campos especificados quedan actualizados en el issue. |

### Flujo Principal

1. El agente invoca `update_issue` con `issueKey` y los campos a modificar
2. El MCP valida que al menos un campo editable esté presente
3. El MCP construye el payload para `PUT /rest/api/3/issue/{issueKey}`
4. Jira aplica los cambios y devuelve 204 No Content
5. El MCP confirma la operación y devuelve un resumen de campos actualizados

### Flujos Alternativos

| Escenario | Manejo |
|-----------|--------|
| **Issue no existe** | 404 → mensaje: "Issue 'XXX-999' not found." |
| **Campo no editable** | 400 → el MCP informa qué campo no es editable en el estado actual |
| **Transición vía update** | El MCP redirige al agente a usar `transition_issue` si el cambio es de estado |
| **Sin cambios** | Si no se especifican campos, error de validación |

### Schema de Entrada

```json
{
  "issueKey": { "type": "string", "description": "Issue key (e.g., 'PROJ-123'). REQUIRED." },
  "summary": { "type": "string", "description": "New summary" },
  "description": { "type": "string", "description": "New description" },
  "priority": { "type": "string", "enum": ["Highest", "High", "Medium", "Low", "Lowest"] },
  "labels": { "type": "array", "items": { "type": "string" }, "description": "Replaces all labels" },
  "components": { "type": "array", "items": { "type": "string" }, "description": "Replaces all components" },
  "customFields": { "type": "object" }
}
```

### Schema de Salida

```json
{
  "key": { "type": "string" },
  "updated": { "type": "boolean" },
  "changedFields": { "type": "array", "items": { "type": "string" } },
  "url": { "type": "string", "format": "uri" }
}
```

### Mapeo a API Jira

- **Endpoint:** `PUT /rest/api/3/issue/{issueIdOrKey}`
- **Documentación:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put

---

## UC-04: Transicionar Issue (Workflow)

| Atributo | Valor |
|----------|-------|
| **ID** | UC-04 |
| **Tool MCP** | `transition_issue` |
| **Actor** | opencode agent |
| **Descripción** | El agente mueve un issue a otro estado del workflow ejecutando una transición. |
| **Precondición** | El issue existe y el usuario tiene permiso `TRANSITION_ISSUES`. |
| **Postcondición** | El issue cambia de estado según la transición ejecutada. |

### Flujo Principal

1. El agente invoca `transition_issue` con `issueKey` y `transitionName` o `transitionId`
2. Si se proveyó `transitionName`, el MCP consulta `GET /rest/api/3/issue/{issueKey}/transitions` para obtener el ID
3. El MCP construye el payload para `POST /rest/api/3/issue/{issueKey}/transitions`
4. Jira ejecuta la transición y devuelve 204 No Content
5. El MCP confirma con el nombre del nuevo estado

### Flujos Alternativos

| Escenario | Manejo |
|-----------|--------|
| **Transición no disponible** | 400 → el MCP lista las transiciones disponibles desde el estado actual |
| **Nombre de transición ambiguo** | El MCP lista las coincidencias y pide al agente que use `transitionId` |
| **Issue no encontrado** | 404 → mensaje descriptivo |
| **Resolución requerida** | 400 → el MCP informa que se requiere un campo de resolución (ej: "Done" requiere `resolution`) |
| **Consulta de transiciones disponibles** | Si el agente pasa `listTransitions: true`, solo se consultan y listan las disponibles |

### Schema de Entrada

```json
{
  "issueKey": { "type": "string", "description": "Issue key (e.g., 'PROJ-123'). REQUIRED." },
  "transitionName": { "type": "string", "description": "Human-readable transition name (e.g., 'In Progress', 'Done')" },
  "transitionId": { "type": "string", "description": "Numeric transition ID (use if name is ambiguous)" },
  "resolution": { "type": "string", "description": "Resolution name (required for some transitions, e.g., 'Done')" },
  "comment": { "type": "string", "description": "Optional comment to add during transition" },
  "listTransitions": { "type": "boolean", "default": false, "description": "If true, only list available transitions" }
}
```

### Schema de Salida

```json
{
  "key": { "type": "string" },
  "transitioned": { "type": "boolean" },
  "fromStatus": { "type": "string" },
  "toStatus": { "type": "string" },
  "url": { "type": "string", "format": "uri" },
  "availableTransitions": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "toStatus": { "type": "string" }
      }
    }
  }
}
```

### Mapeo a API Jira

- **Listar transiciones:** `GET /rest/api/3/issue/{issueIdOrKey}/transitions`
- **Ejecutar transición:** `POST /rest/api/3/issue/{issueIdOrKey}/transitions`
- **Documentación:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-post

---

## UC-05: Consultar Sprints

| Atributo | Valor |
|----------|-------|
| **ID** | UC-05 |
| **Tool MCP** | `get_sprints` |
| **Actor** | opencode agent |
| **Descripción** | El agente consulta sprints de un board, filtrando por estado (active/future/closed). |
| **Precondición** | El board existe y el usuario tiene acceso. |
| **Postcondición** | Se devuelve la lista de sprints con detalles e issues asociados. |

### Flujo Principal

1. El agente invoca `get_sprints` con `boardId` o `boardName`
2. Si se provee `boardName`, el MCP busca el board por nombre → obtiene `boardId`
3. El MCP llama a `GET /rest/agile/1.0/board/{boardId}/sprint?state={state}`
4. Jira devuelve la lista de sprints
5. Opcionalmente, si `includeIssues: true`, el MCP consulta los issues de cada sprint
6. El MCP formatea y devuelve la respuesta

### Flujos Alternativos

| Escenario | Manejo |
|-----------|--------|
| **Board no encontrado** | 404 → mensaje con sugerencia de boards disponibles |
| **Sin sprints activos** | Respuesta con lista vacía y mensaje informativo |
| **Rate limit** | 429 → backoff exponencial |

### Schema de Entrada

```json
{
  "boardId": { "type": "integer", "description": "Board ID (e.g., 42)" },
  "boardName": { "type": "string", "description": "Board name (alternative to boardId)" },
  "state": { "type": "string", "enum": ["active", "future", "closed"], "default": "active" },
  "includeIssues": { "type": "boolean", "default": false },
  "startAt": { "type": "integer", "default": 0 },
  "maxResults": { "type": "integer", "default": 50 }
}
```

### Schema de Salida

```json
{
  "boardId": { "type": "integer" },
  "boardName": { "type": "string" },
  "total": { "type": "integer" },
  "sprints": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "name": { "type": "string" },
        "state": { "type": "string" },
        "goal": { "type": "string" },
        "startDate": { "type": "string", "format": "date" },
        "endDate": { "type": "string", "format": "date" },
        "issueCount": { "type": "integer" },
        "issues": {
          "type": "array",
          "items": { "type": "object" },
          "description": "Only present if includeIssues=true"
        }
      }
    }
  }
}
```

### Mapeo a API Jira

- **Buscar board por nombre:** `GET /rest/agile/1.0/board?name={name}`
- **Listar sprints:** `GET /rest/agile/1.0/board/{boardId}/sprint`
- **Issues del sprint:** `GET /rest/agile/1.0/sprint/{sprintId}/issue`
- **Documentación:** https://developer.atlassian.com/cloud/jira/software/rest/

---

## UC-06: Asignar/Desasignar Usuario

| Atributo | Valor |
|----------|-------|
| **ID** | UC-06 |
| **Tool MCP** | `assign_user` |
| **Actor** | opencode agent |
| **Descripción** | El agente asigna un usuario como responsable de un issue, o lo desasigna. |
| **Precondición** | El issue existe. Si se asigna, el usuario existe y tiene permisos. |
| **Postcondición** | El campo `assignee` del issue queda actualizado. |

### Flujo Principal

1. El agente invoca `assign_user` con `issueKey` y `accountId`
2. Si `accountId` es `null` o `"unassigned"`, se desasigna
3. El MCP llama a `PUT /rest/api/3/issue/{issueKey}/assignee` (asignar) o al campo `assignee` en `PUT /rest/api/3/issue/{issueKey}` (desasignar)
4. Jira confirma el cambio
5. El MCP devuelve el nuevo estado de asignación

### Flujos Alternativos

| Escenario | Manejo |
|-----------|--------|
| **Usuario no encontrado** | 404 → mensaje: "User with accountId 'XXX' not found." |
| **Usuario sin permisos** | 400 → mensaje: "User 'XXX' does not have access to this project." |
| **Issue no encontrado** | 404 |
| **Desasignar** | `accountId: null` → el issue queda sin responsable |

### Schema de Entrada

```json
{
  "issueKey": { "type": "string", "description": "Issue key (e.g., 'PROJ-123'). REQUIRED." },
  "accountId": { "type": "string", "description": "Atlassian Account ID. Use null or 'unassigned' to unassign. REQUIRED." }
}
```

### Schema de Salida

```json
{
  "key": { "type": "string" },
  "assignee": {
    "type": "object",
    "properties": {
      "accountId": { "type": "string" },
      "displayName": { "type": "string" },
      "emailAddress": { "type": "string", "format": "email" }
    },
    "nullable": true
  },
  "url": { "type": "string", "format": "uri" }
}
```

### Mapeo a API Jira

- **Asignar:** `PUT /rest/api/3/issue/{issueIdOrKey}/assignee` con body `{ "accountId": "..." }`
- **Desasignar:** `PUT /rest/api/3/issue/{issueIdOrKey}` con body `{ "fields": { "assignee": null } }`
- **Documentación:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-assignee-put

---

## UC-07: Gestionar Comentarios

| Atributo | Valor |
|----------|-------|
| **ID** | UC-07 |
| **Tool MCP** | `manage_comments` |
| **Actor** | opencode agent |
| **Descripción** | El agente lee los comentarios existentes de un issue o añade uno nuevo. |
| **Precondición** | El issue existe y el usuario tiene permiso `COMMENT_ISSUES`. |
| **Postcondición** | Si es lectura: se devuelve la lista. Si es escritura: el comentario queda publicado. |

### Flujo Principal — Lectura

1. El agente invoca `manage_comments` con `action: "list"` e `issueKey`
2. El MCP llama a `GET /rest/api/3/issue/{issueKey}/comment`
3. Jira devuelve la lista paginada de comentarios
4. El MCP formatea y devuelve la lista

### Flujo Principal — Escritura

1. El agente invoca `manage_comments` con `action: "add"`, `issueKey` y `body`
2. El MCP construye el payload para `POST /rest/api/3/issue/{issueKey}/comment`
3. Jira crea el comentario y devuelve el objeto creado
4. El MCP devuelve confirmación con el id y contenido del comentario

### Flujos Alternativos

| Escenario | Manejo |
|-----------|--------|
| **Issue no encontrado** | 404 |
| **Comentario vacío** | Error de validación: "Comment body cannot be empty." |
| **Sin comentarios** | `action: "list"` devuelve array vacío |
| **Rate limit** | 429 → backoff |

### Schema de Entrada

```json
{
  "action": { "type": "string", "enum": ["list", "add"], "description": "REQUIRED." },
  "issueKey": { "type": "string", "description": "Issue key. REQUIRED." },
  "body": { "type": "string", "description": "Comment text (required for 'add' action). Supports Jira markdown." },
  "startAt": { "type": "integer", "default": 0, "description": "Pagination offset (for 'list' action)" },
  "maxResults": { "type": "integer", "default": 50, "description": "Max comments to return (for 'list' action)" }
}
```

### Schema de Salida — list

```json
{
  "issueKey": { "type": "string" },
  "total": { "type": "integer" },
  "comments": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "author": { "type": "string" },
        "body": { "type": "string" },
        "created": { "type": "string", "format": "date-time" },
        "updated": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

### Schema de Salida — add

```json
{
  "issueKey": { "type": "string" },
  "commentId": { "type": "string" },
  "author": { "type": "string" },
  "body": { "type": "string" },
  "created": { "type": "string", "format": "date-time" },
  "url": { "type": "string", "format": "uri" }
}
```

### Mapeo a API Jira

- **Listar:** `GET /rest/api/3/issue/{issueIdOrKey}/comment`
- **Crear:** `POST /rest/api/3/issue/{issueIdOrKey}/comment`
- **Documentación:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/

---

## UC-08: Adjuntar Archivo

| Atributo | Valor |
|----------|-------|
| **ID** | UC-08 |
| **Tool MCP** | `attach_file` |
| **Actor** | opencode agent |
| **Descripción** | El agente adjunta un archivo local a un issue de Jira. |
| **Precondición** | El issue existe, el archivo existe en el sistema local, el usuario tiene permiso `ATTACH_FILES`. |
| **Postcondición** | El archivo queda adjunto al issue en Jira. |

### Flujo Principal

1. El agente invoca `attach_file` con `issueKey` y `filePath`
2. El MCP verifica que el archivo existe y es legible
3. El MCP verifica el tamaño (máx 10 MB por defecto en Jira Cloud)
4. El MCP lee el archivo y lo envía como `multipart/form-data` a `POST /rest/api/3/issue/{issueKey}/attachments`
5. Jira almacena el adjunto y devuelve metadatos
6. El MCP devuelve confirmación con nombre, tamaño, tipo MIME y URL

### Flujos Alternativos

| Escenario | Manejo |
|-----------|--------|
| **Archivo no encontrado** | Error: "File not found at path: '...'" |
| **Archivo excede tamaño** | Error: "File size (X MB) exceeds Jira limit (10 MB)." |
| **Issue no encontrado** | 404 |
| **Tipo MIME no soportado** | Jira rechaza → MCP informa el error |
| **Sin permisos** | 403 → mensaje claro |

### Schema de Entrada

```json
{
  "issueKey": { "type": "string", "description": "Issue key (e.g., 'PROJ-123'). REQUIRED." },
  "filePath": { "type": "string", "description": "Absolute or relative path to the file. REQUIRED." }
}
```

### Schema de Salida

```json
{
  "issueKey": { "type": "string" },
  "attachment": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "filename": { "type": "string" },
      "size": { "type": "integer", "description": "Size in bytes" },
      "mimeType": { "type": "string" },
      "created": { "type": "string", "format": "date-time" },
      "url": { "type": "string", "format": "uri" }
    }
  }
}
```

### Mapeo a API Jira

- **Endpoint:** `POST /rest/api/3/issue/{issueIdOrKey}/attachments`
- **Headers:** `X-Atlassian-Token: no-check` (bypass CSRF for API tokens), `Content-Type: multipart/form-data`
- **Documentación:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/

---

## UC-09: Validación de Conexión (Health Check)

| Atributo | Valor |
|----------|-------|
| **ID** | UC-09 |
| **Tool MCP** | `jira_health_check` |
| **Actor** | opencode agent |
| **Descripción** | Verifica que la conexión a Jira Cloud es funcional y las credenciales son válidas. |
| **Precondición** | Variables de entorno configuradas. |
| **Postcondición** | Se confirma conectividad y se muestra información básica de la instancia. |

### Flujo Principal

1. El agente invoca `jira_health_check`
2. El MCP llama a `GET /rest/api/3/myself`
3. Jira devuelve los datos del usuario autenticado
4. El MCP devuelve estado OK con display name, email y URL de la instancia

### Schema de Salida

```json
{
  "status": { "type": "string", "enum": ["connected", "error"] },
  "user": {
    "type": "object",
    "properties": {
      "accountId": { "type": "string" },
      "displayName": { "type": "string" },
      "emailAddress": { "type": "string" }
    }
  },
  "jiraHost": { "type": "string" },
  "timestamp": { "type": "string", "format": "date-time" }
}
```

### Mapeo a API Jira

- **Endpoint:** `GET /rest/api/3/myself`
- **Documentación:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-users/#api-rest-api-3-myself-get

---

## Matriz de Trazabilidad Use Case → Tool MCP → API Jira

| UC | Tool MCP | Método HTTP | Endpoint Jira |
|----|----------|-------------|---------------|
| UC-01 | `search_issues` | POST | `/rest/api/3/search` |
| UC-02 | `create_issue` | POST | `/rest/api/3/issue` |
| UC-03 | `update_issue` | PUT | `/rest/api/3/issue/{key}` |
| UC-04 | `transition_issue` | GET + POST | `/rest/api/3/issue/{key}/transitions` |
| UC-05 | `get_sprints` | GET | `/rest/agile/1.0/board/{id}/sprint` |
| UC-06 | `assign_user` | PUT | `/rest/api/3/issue/{key}/assignee` |
| UC-07 | `manage_comments` | GET + POST | `/rest/api/3/issue/{key}/comment` |
| UC-08 | `attach_file` | POST | `/rest/api/3/issue/{key}/attachments` |
| UC-09 | `jira_health_check` | GET | `/rest/api/3/myself` |
