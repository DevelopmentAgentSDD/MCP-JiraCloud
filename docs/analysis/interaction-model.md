# Interaction Model — opencode-jira-mcp

> **Proyecto:** opencode-jira-mcp  
> **Tipo:** MCP Server para Jira Cloud  
> **Versión:** MVP v1.0.0  
> **Fecha:** 2026-06-13  

---

## 1. Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────┐
│                     opencode (AI Agent)                  │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  User     │───▶│  LLM Core    │───▶│  MCP Client   │  │
│  │  Prompt   │    │  (reasoning) │    │  (stdio)      │  │
│  └──────────┘    └──────────────┘    └───────┬───────┘  │
└──────────────────────────────────────────────┼──────────┘
                                               │ stdio (JSON-RPC 2.0)
                                               │
┌──────────────────────────────────────────────┼──────────┐
│               opencode-jira-mcp (MCP Server) │          │
│                                              ▼          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              MCP Protocol Layer                    │   │
│  │  - tools/list (capability discovery)              │   │
│  │  - tools/call (invocation)                        │   │
│  │  - JSON-RPC 2.0 message handling                  │   │
│  └──────────────────────┬───────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼───────────────────────────┐   │
│  │            Tool Handlers (9 handlers)             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │  │ search   │ │ create   │ │ transition       │  │   │
│  │  │ issues   │ │ issue    │ │ issue            │  │   │
│  │  └──────────┘ └──────────┘ └──────────────────┘  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │  │ update   │ │ get      │ │ assign           │  │   │
│  │  │ issue    │ │ sprints  │ │ user             │  │   │
│  │  └──────────┘ └──────────┘ └──────────────────┘  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │  │ manage   │ │ attach   │ │ health           │  │   │
│  │  │ comments │ │ file     │ │ check            │  │   │
│  │  └──────────┘ └──────────┘ └──────────────────┘  │   │
│  └──────────────────────┬───────────────────────────┘   │
│                         │                               │
│  ┌──────────────────────▼───────────────────────────┐   │
│  │           Jira API Client (HTTP)                  │   │
│  │  - Authentication (Basic Auth: email + token)     │   │
│  │  - Rate limiting (backoff + retry)                │   │
│  │  - Error mapping (Jira error → user-friendly)     │   │
│  │  - Request/response logging (token redacted)      │   │
│  └──────────────────────┬───────────────────────────┘   │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │ HTTPS (TLS 1.2+)
                          │
┌─────────────────────────▼───────────────────────────────┐
│                   Jira Cloud (Atlassian)                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │  REST API v3  +  Agile API                       │   │
│  │  https://{host}.atlassian.net/rest/               │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Ciclo de Vida MCP

### 2.1 Fase de Inicialización

```
opencode (MCP Client)              opencode-jira-mcp (MCP Server)
        │                                      │
        │  1. spawn process (node server.js)   │
        │─────────────────────────────────────▶│
        │                                      │
        │  2. initialize request                │
        │  {                                   │
        │    "jsonrpc": "2.0",                 │
        │    "id": 1,                          │
        │    "method": "initialize",           │
        │    "params": {                       │
        │      "protocolVersion": "2024-11-05",│
        │      "capabilities": {...},          │
        │      "clientInfo": {                 │
        │        "name": "opencode",           │
        │        "version": "1.0.0"            │
        │      }                               │
        │    }                                 │
        │  }                                   │
        │─────────────────────────────────────▶│
        │                                      │
        │  3. initialize response               │
        │  {                                   │
        │    "jsonrpc": "2.0",                 │
        │    "id": 1,                          │
        │    "result": {                       │
        │      "protocolVersion": "2024-11-05",│
        │      "capabilities": {               │
        │        "tools": {}                   │
        │      },                              │
        │      "serverInfo": {                 │
        │        "name": "opencode-jira-mcp",  │
        │        "version": "1.0.0"            │
        │      }                               │
        │    }                                 │
        │  }                                   │
        │◀─────────────────────────────────────│
        │                                      │
        │  4. initialized notification          │
        │  {"jsonrpc":"2.0","method":          │
        │   "notifications/initialized"}       │
        │─────────────────────────────────────▶│
        │                                      │
```

### 2.2 Descubrimiento de Capacidades (tools/list)

```
opencode (MCP Client)              opencode-jira-mcp (MCP Server)
        │                                      │
        │  tools/list request                   │
        │  {"jsonrpc":"2.0","id":2,            │
        │   "method":"tools/list"}             │
        │─────────────────────────────────────▶│
        │                                      │
        │  tools/list response                  │
        │  {"jsonrpc":"2.0","id":2,            │
        │   "result":{                         │
        │     "tools":[                        │
        │       {                              │
        │         "name":"search_issues",      │
        │         "description":"Search Jira   │
        │           issues using JQL...",      │
        │         "inputSchema":{...}          │
        │       },                             │
        │       {                              │
        │         "name":"create_issue",       │
        │         ...                          │
        │       },                             │
        │       ... (9 tools total)            │
        │     ]                                │
        │   }                                  │
        │  }                                   │
        │◀─────────────────────────────────────│
        │                                      │
```

### 2.3 Invocación de Tool (tools/call)

```
opencode (MCP Client)              opencode-jira-mcp (MCP Server)
        │                                      │
        │  tools/call request                   │
        │  {"jsonrpc":"2.0","id":3,            │
        │   "method":"tools/call",             │
        │   "params":{                         │
        │     "name":"search_issues",          │
        │     "arguments":{                    │
        │       "projectKey":"PROJ",           │
        │       "status":"In Progress",        │
        │       "maxResults":10                │
        │     }                                │
        │   }                                  │
        │  }                                   │
        │─────────────────────────────────────▶│
        │                                      │
        │             ┌──────────────────┐     │
        │             │ 1. Validate input │     │
        │             │    (Zod schema)   │     │
        │             └────────┬─────────┘     │
        │                      │               │
        │             ┌────────▼─────────┐     │
        │             │ 2. Build JQL     │     │
        │             │    query string  │     │
        │             └────────┬─────────┘     │
        │                      │               │
        │             ┌────────▼─────────┐     │
        │             │ 3. Call Jira API │────▶│ Jira Cloud
        │             │    POST /search  │     │
        │             └────────┬─────────┘     │
        │                      │               │
        │             ┌────────▼─────────┐     │
        │             │ 4. Transform     │◀────│ Jira response
        │             │    response      │     │
        │             └────────┬─────────┘     │
        │                      │               │
        │  tools/call response  │               │
        │  {"jsonrpc":"2.0","id":3,            │
        │   "result":{                         │
        │     "content":[                      │
        │       {"type":"text",                │
        │        "text":"Found 3 issues:\n     │
        │          PROJ-101: Fix login bug\n   │
        │          PROJ-102: Add dark mode\n   │
        │          PROJ-103: Update docs"}     │
        │     ]                                │
        │   }                                  │
        │  }                                   │
        │◀─────────────────────────────────────│
        │                                      │
```

---

## 3. Flujo Complejo: Crear Issue y Transicionar

Este flujo muestra cómo opencode encadena múltiples tools del MCP para lograr un objetivo compuesto.

```
User: "Create a high-priority bug in PROJ for the login crash and assign it to me"

opencode (LLM reasoning):
  1. Identifies: need create_issue tool
  2. Identifies: need to find user accountId first (not exposed as tool in MVP)
  3. Decides: use search_issues to query by assignee=currentUser() to discover accountId
  4. Then: create_issue with assignee=foundAccountId

  ── tools/call: search_issues ──────────────────────────▶
     { projectKey: "PROJ", assignee: "currentUser()", maxResults: 1 }
  ◀──────────────────────────────────────────────────────
     { issues: [{ key: "PROJ-50", assignee: { accountId: "712020:abc-123", displayName: "John" } }] }

  ── tools/call: create_issue ───────────────────────────▶
     { projectKey: "PROJ", summary: "Login crash on v2.3",
       issueType: "Bug", priority: "High",
       assignee: "712020:abc-123",
       description: "App crashes when clicking login..." }
  ◀──────────────────────────────────────────────────────
     { key: "PROJ-151", id: "10051", url: "https://..." }

User: "Now move it to In Progress"

opencode:
  ── tools/call: transition_issue ───────────────────────▶
     { issueKey: "PROJ-151", transitionName: "In Progress" }
  ◀──────────────────────────────────────────────────────
     { transitioned: true, toStatus: "In Progress" }
```

---

## 4. Manejo de Errores en la Cadena

### 4.1 Error en la Capa MCP (antes de llegar a Jira)

```
opencode                         MCP Server
   │                                  │
   │  tools/call (search_issues)      │
   │  { projectKey: 123 } ← INVALID   │
   │─────────────────────────────────▶│
   │                                  │── Zod validation fails
   │                                  │   (projectKey must be string)
   │  Error response                  │
   │  { "jsonrpc":"2.0",              │
   │    "id":5,                       │
   │    "error": {                    │
   │      "code": -32602,            │
   │      "message": "Invalid params",│
   │      "data": {                   │
   │        "validationErrors": [     │
   │          { "path": "projectKey", │
   │            "message": "Expected  │
   │              string, got number",│
   │            "received": 123 }     │
   │        ]                         │
   │      }                           │
   │    }                             │
   │  }                               │
   │◀─────────────────────────────────│
```

### 4.2 Error Propagado desde Jira Cloud

```
opencode                         MCP Server                    Jira Cloud
   │                                  │                             │
   │  tools/call (create_issue)       │                             │
   │─────────────────────────────────▶│                             │
   │                                  │── POST /rest/api/3/issue ──▶│
   │                                  │                             │── 400 Bad Request
   │                                  │◀────────────────────────────│   { "errorMessages":
   │                                  │   Jira error mapped to       │     ["Project 'XXX'
   │                                  │   user-friendly message:     │      does not exist"]
   │                                  │   "Project 'XXX' not found.  │   }
   │                                  │    Verify the project key."  │
   │  Error response                  │                             │
   │  { "jsonrpc":"2.0",              │                             │
   │    "id":6,                       │                             │
   │    "error": {                    │                             │
   │      "code": -32000,            │                             │
   │      "message": "Project 'XXX'   │                             │
   │        not found. Verify the     │                             │
   │        project key. Use          │                             │
   │        search_issues to find     │                             │
   │        available projects."      │                             │
   │      }                           │                             │
   │    }                             │                             │
   │  }                               │                             │
   │◀─────────────────────────────────│                             │
```

---

## 5. Rate Limiting y Reintentos

```
MCP Server                                              Jira Cloud
   │                                                         │
   │── POST /rest/api/3/issue ──────────────────────────────▶│
   │                                                         │── 429 Too Many Requests
   │◀────────────────────────────────────────────────────────│   Retry-After: 30
   │                                                         │
   │ Rate limit hit. Calculate wait:                         │
   │   attempt 1: wait 30s (from Retry-After header)         │
   │                                                         │
   │   ... 30 seconds later ...                              │
   │                                                         │
   │── POST /rest/api/3/issue (retry 1) ────────────────────▶│
   │                                                         │── 429 (again)
   │◀────────────────────────────────────────────────────────│   Retry-After: 60
   │                                                         │
   │   attempt 2: wait 60s (exponential backoff)             │
   │                                                         │
   │   ... 60 seconds later ...                              │
   │                                                         │
   │── POST /rest/api/3/issue (retry 2) ────────────────────▶│
   │                                                         │── 201 Created
   │◀────────────────────────────────────────────────────────│   { key: "PROJ-200", ... }
   │                                                         │
   │── Return success to opencode                            │
   │                                                         │

Si los 3 reintentos fallan:
   │── Return error to opencode:                             │
   │    "Jira API rate limit exceeded after 3 retries.       │
   │     Please wait and try again later."                   │
```

---

## 6. Segregación de Canales: stdio vs stderr

```
┌─────────────────────────────────────────────────────────┐
│                  MCP Server Process                      │
│                                                         │
│  stdin  ◀─── JSON-RPC messages from opencode            │
│  stdout ───▶ JSON-RPC responses to opencode             │
│                                                         │
│  stderr ───▶ Structured logs (Winston/Pino)             │
│             { "level": "info",                          │
│               "msg": "search_issues called",            │
│               "projectKey": "PROJ",                     │
│               "user": "j***@example.com",  ← REDACTED   │
│               "timestamp": "2026-06-13T14:23:00Z" }     │
│                                                         │
│  ⚠️ NUNCA escribir en stdout nada que no sea            │
│     JSON-RPC 2.0 válido.                                │
│  ⚠️ NUNCA incluir el API Token en ningún log.           │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Modelo de Datos Interno del MCP

```typescript
// Estructura conceptual — no implementación

// Capa de protocolo
interface McpRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;          // "tools/list" | "tools/call" | "initialize"
  params?: unknown;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;          // -32700 parse, -32600 invalid request, -32601 method not found, -32602 invalid params, -32000 server error
    message: string;
    data?: unknown;
  };
}

// Tool definition (tools/list response)
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodSchema;  // JSON Schema generated from Zod
}

// Tool invocation (tools/call)
interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

// Tool result (tools/call response)
interface ToolCallResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
```

---

## 8. Diagrama de Secuencia: Startup y First Call

```
User          opencode          MCP Server (spawn)      Jira Cloud
 │               │                    │                     │
 │  "Find my     │                    │                     │
 │   open bugs"  │                    │                     │
 │──────────────▶│                    │                     │
 │               │ Spawn:            │                     │
 │               │ node dist/index.js│                     │
 │               │──────────────────▶│                     │
 │               │                    │ Startup:            │
 │               │                    │ - Read env vars     │
 │               │                    │ - Validate config   │
 │               │                    │ - Build tool schemas│
 │               │                    │                     │
 │               │ initialize         │                     │
 │               │───────────────────▶│                     │
 │               │◀───────────────────│ capabilities:       │
 │               │                    │   tools: {}          │
 │               │                    │                     │
 │               │ tools/list         │                     │
 │               │───────────────────▶│                     │
 │               │◀───────────────────│ 9 tools + schemas   │
 │               │                    │                     │
 │               │ (LLM reasons about │                     │
 │               │  which tool to use)│                     │
 │               │                    │                     │
 │               │ tools/call:        │                     │
 │               │ search_issues      │                     │
 │               │ {jql:"status=Open  │                     │
 │               │  AND assignee=     │                     │
 │               │  currentUser()"}   │                     │
 │               │───────────────────▶│                     │
 │               │                    │ POST /search ──────▶│
 │               │                    │◀────────────────────│ 200 OK
 │               │◀───────────────────│ issues: [...]       │
 │               │                    │                     │
 │  "You have    │                    │                     │
 │   3 open bugs:│                    │                     │
 │   PROJ-101..."│                    │                     │
 │◀──────────────│                    │                     │
```

---

## 9. Principios de Diseño del Modelo de Interacción

1. **Stateless:** El MCP Server no mantiene estado entre invocaciones. Cada `tools/call` es independiente.
2. **Fail Fast:** Validación de entrada con Zod antes de cualquier llamada a Jira.
3. **Error Translation:** Los errores de Jira (códigos HTTP, mensajes técnicos) se traducen a mensajes accionables para el LLM.
4. **Minimal Surface:** Solo se exponen las tools necesarias. Si el LLM pregunta "qué transiciones están disponibles", la respuesta debe sugerir `transition_issue` con `listTransitions: true`.
5. **Idempotency Guidance:** Las tools de creación incluyen suficientes campos para que el LLM pueda hacer deduplicación lógica (ej: "¿ya existe un bug con este summary en este proyecto?").
6. **Token Safety:** El API Token solo existe en memoria durante el request HTTP. Nunca se serializa a JSON, logs, o respuestas.
