# Module Structure — opencode-jira-mcp

> **Proyecto:** opencode-jira-mcp
> **Tipo:** Estructura de módulos TypeScript
> **Arquitectura:** Módulos funcionales con capas horizontales (ADR-005)
> **Versión:** MVP v1.0.0
> **Fecha:** 2026-06-13

---

## 1. Árbol de Archivos

```
opencode-jira-mcp/
│
├── .env.example                    # Template de variables de entorno
├── .gitignore                      # Exclusiones git (node_modules, dist, .env, tokens)
├── .eslintrc.json                  # ESLint flat config
├── .prettierrc                     # Prettier config
├── tsconfig.json                   # TypeScript strict config
├── package.json                    # Dependencias, scripts, bin entry
├── vitest.config.ts                # Configuración de Vitest
├── README.md                       # Documentación de usuario
│
├── src/
│   ├── index.ts                    # Entry point: inicializa y arranca el MCP Server
│   ├── server.ts                   # Configuración y ciclo de vida del MCP Server
│   │
│   ├── config/
│   │   └── index.ts                # Lectura, validación y sanitización de env vars
│   │
│   ├── auth/
│   │   └── index.ts                # Construcción del header Basic Auth
│   │
│   ├── transport/
│   │   └── stdio-server.ts         # Configuración del transporte stdio (MCP SDK)
│   │
│   ├── tools/                      # Handlers de cada tool MCP (9 tools)
│   │   ├── register.ts             # Registro centralizado de todas las tools
│   │   ├── search-issues.ts        # Tool handler: search_issues
│   │   ├── create-issue.ts         # Tool handler: create_issue
│   │   ├── update-issue.ts         # Tool handler: update_issue
│   │   ├── transition-issue.ts     # Tool handler: transition_issue
│   │   ├── get-sprints.ts          # Tool handler: get_sprints
│   │   ├── assign-user.ts          # Tool handler: assign_user
│   │   ├── manage-comments.ts      # Tool handler: manage_comments
│   │   ├── attach-file.ts          # Tool handler: attach_file
│   │   └── health-check.ts         # Tool handler: jira_health_check
│   │
│   ├── schemas/                    # Zod schemas (input + output) por tool
│   │   ├── search-issues.ts
│   │   ├── create-issue.ts
│   │   ├── update-issue.ts
│   │   ├── transition-issue.ts
│   │   ├── get-sprints.ts
│   │   ├── assign-user.ts
│   │   ├── manage-comments.ts
│   │   ├── attach-file.ts
│   │   └── health-check.ts
│   │
│   ├── services/
│   │   └── jira-client.ts          # Cliente HTTP unificado para Jira Cloud API
│   │
│   ├── utils/
│   │   ├── errors.ts               # Jerarquía de errores (McpError, ValidationError, ...)
│   │   ├── retry.ts                # Rate limiting con backoff exponencial
│   │   └── sanitize.ts             # Sanitización de tokens y datos sensibles
│   │
│   └── types/
│       ├── mcp.ts                  # Tipos del protocolo MCP (JSON-RPC 2.0)
│       ├── jira.ts                 # Tipos de dominio Jira (Issue, Sprint, User, ...)
│       └── index.ts                # Re-exporta todos los tipos
│
├── tests/
│   ├── unit/
│   │   ├── config/
│   │   │   └── index.test.ts       # Pruebas de carga y validación de env vars
│   │   ├── auth/
│   │   │   └── index.test.ts       # Pruebas de construcción de header Basic Auth
│   │   ├── tools/
│   │   │   ├── search-issues.test.ts
│   │   │   ├── create-issue.test.ts
│   │   │   ├── update-issue.test.ts
│   │   │   ├── transition-issue.test.ts
│   │   │   ├── get-sprints.test.ts
│   │   │   ├── assign-user.test.ts
│   │   │   ├── manage-comments.test.ts
│   │   │   ├── attach-file.test.ts
│   │   │   └── health-check.test.ts
│   │   ├── schemas/
│   │   │   ├── search-issues.test.ts
│   │   │   ├── create-issue.test.ts
│   │   │   ├── update-issue.test.ts
│   │   │   ├── transition-issue.test.ts
│   │   │   ├── get-sprints.test.ts
│   │   │   ├── assign-user.test.ts
│   │   │   ├── manage-comments.test.ts
│   │   │   ├── attach-file.test.ts
│   │   │   └── health-check.test.ts
│   │   ├── services/
│   │   │   └── jira-client.test.ts  # Pruebas del cliente HTTP con fetch mockeado
│   │   └── utils/
│   │       ├── errors.test.ts
│   │       ├── retry.test.ts
│   │       └── sanitize.test.ts
│   │
│   ├── integration/
│   │   ├── mcp-protocol.test.ts     # Pruebas del ciclo MCP completo (stdio simulado)
│   │   ├── token-safety.test.ts     # Prueba de seguridad: token nunca en stdout/stderr
│   │   └── jira-api.test.ts         # Pruebas contra Jira real (requiere credenciales, CI only)
│   │
│   └── fixtures/
│       └── jira-responses/          # Respuestas JSON mock de Jira API
│           ├── search-issues.json
│           ├── create-issue.json
│           ├── transitions.json
│           ├── sprints.json
│           ├── comments.json
│           ├── attachment.json
│           ├── myself.json
│           └── errors/
│               ├── 400-invalid-jql.json
│               ├── 401-unauthorized.json
│               ├── 403-forbidden.json
│               ├── 404-not-found.json
│               └── 429-rate-limit.json
│
└── docs/
    ├── analysis/
    │   ├── scope.md
    │   ├── use-cases.md
    │   ├── interaction-model.md
    │   └── authentication-flow.md
    ├── architecture.md
    └── design/
        ├── mcp-tools-contract.md    # Este artefacto
        ├── data-model.md            # Este artefacto
        └── module-structure.md      # Este artefacto
```

---

## 2. Propósito y Responsabilidad de Cada Archivo

### 2.1 Entry Point y Server

| Archivo | Responsabilidad | Dependencias |
|---------|----------------|--------------|
| `src/index.ts` | Entry point. Carga configuración, crea el MCP Server, registra tools, arranca transporte stdio. Maneja errores de startup y señales de terminación (SIGINT, SIGTERM). | `server.ts`, `config/index.ts`, `tools/register.ts` |
| `src/server.ts` | Crea y configura la instancia de `McpServer` del SDK. Establece `serverInfo` (name, version). No registra tools directamente — delega a `register.ts`. | `@modelcontextprotocol/sdk`, `transport/stdio-server.ts` |

### 2.2 Configuración y Autenticación

| Archivo | Responsabilidad | Dependencias |
|---------|----------------|--------------|
| `src/config/index.ts` | Lee `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN` de `process.env`. Valida con Zod. Construye `JiraConfig` con URLs base derivadas. Sanitiza config para logging. | `zod`, `types/index.ts` |
| `src/auth/index.ts` | Construye el header `Authorization: Basic base64(email:token)`. Expone función pura `buildAuthHeader(email, token): string`. No accede a env vars (recibe parámetros). | `types/index.ts` |

### 2.3 Transporte

| Archivo | Responsabilidad | Dependencias |
|---------|----------------|--------------|
| `src/transport/stdio-server.ts` | Configura el `StdioServerTransport` del SDK MCP. Conecta el `McpServer` al transporte. Maneja errores de conexión y cierre del stream. | `@modelcontextprotocol/sdk/server/stdio.js` |

### 2.4 Tools y Schemas

| Archivo | Responsabilidad |
|---------|----------------|
| `src/tools/register.ts` | Registra las 9 tools en la instancia de `McpServer`. Importa cada handler y llama a `server.tool(name, description, inputSchema, handler)`. |
| `src/tools/search-issues.ts` | Handler de `search_issues`. Valida input, construye JQL, llama a Jira Client, formatea respuesta. |
| `src/tools/create-issue.ts` | Handler de `create_issue`. Valida input, construye payload, llama a Jira Client, formatea respuesta. |
| `src/tools/update-issue.ts` | Handler de `update_issue`. Valida input, construye payload, llama a Jira Client. |
| `src/tools/transition-issue.ts` | Handler de `transition_issue`. Lista transiciones, resuelve por nombre, ejecuta transición. |
| `src/tools/get-sprints.ts` | Handler de `get_sprints`. Resuelve boardId por nombre, consulta sprints, opcionalmente issues. |
| `src/tools/assign-user.ts` | Handler de `assign_user`. Asigna/desasigna usuario. |
| `src/tools/manage-comments.ts` | Handler de `manage_comments`. Soporta acciones `list` y `add`. |
| `src/tools/attach-file.ts` | Handler de `attach_file`. Valida archivo local, construye FormData, envía. |
| `src/tools/health-check.ts` | Handler de `jira_health_check`. Llama a GET /rest/api/3/myself, devuelve estado. |

**Schemas (src/schemas/):** Cada archivo de schema exporta:
- `{ToolName}InputSchema` — Zod schema para validar los argumentos de entrada
- `{ToolName}Input` — Tipo TypeScript inferido del schema de entrada
- `{ToolName}OutputSchema` — Zod schema para validar/formatear la respuesta (opcional, usado en tests)
- `{ToolName}Output` — Tipo TypeScript de la respuesta

### 2.5 Servicios y Utilidades

| Archivo | Responsabilidad | Dependencias |
|---------|----------------|--------------|
| `src/services/jira-client.ts` | Cliente HTTP unificado para Jira Cloud. Expone métodos: `get(path, query)`, `post(path, body)`, `put(path, body)`. Construye URLs completas (baseUrl + path), añade headers de auth y content-type. Integra rate limiting. Traduce errores HTTP a `McpError`. Sanitiza headers en logs. | `auth/index.ts`, `utils/retry.ts`, `utils/errors.ts`, `utils/sanitize.ts`, `types/index.ts` |
| `src/utils/errors.ts` | Jerarquía de errores: `McpError` base, `ValidationError`, `JiraAuthError`, `RateLimitError`, `NetworkError`, `TimeoutError`. Cada uno con código JSON-RPC y mensaje descriptivo. | `types/mcp.ts` |
| `src/utils/retry.ts` | Función `withRetry<T>(fn, options)` que ejecuta una función asíncrona con backoff exponencial. Respeta header `Retry-After` de Jira. Máximo configurable de reintentos. Logging en cada reintento. | `types/index.ts` |
| `src/utils/sanitize.ts` | Funciones: `sanitizeHeaders(headers)`, `sanitizeConfig(config)`, `redactToken(text)`. Garantizan que el API Token nunca aparezca en logs o respuestas. | — |

### 2.6 Tipos Compartidos

| Archivo | Contenido |
|---------|-----------|
| `src/types/mcp.ts` | `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`, `ErrorCodes`, `ToolDefinition`, `ToolCallResult`, `ToolCallContent` |
| `src/types/jira.ts` | `Issue`, `IssueSearchResult`, `Sprint`, `SprintSearchResult`, `JiraUser`, `JiraComment`, `CommentListResult`, `CommentAddResult`, `JiraTransition`, `TransitionResult`, `JiraAttachment`, `AttachmentResult`, `CreateIssueResult`, `UpdateIssueResult`, `AssignUserResult`, `HealthCheckResult`, `JiraConfig`, `SanitizedConfig`, `RateLimitConfig`, `JiraRequestOptions`, `JiraApiResponse`, `JiraErrorResponse` |
| `src/types/index.ts` | Re-exporta todos los tipos de `mcp.ts` y `jira.ts` |

---

## 3. Diagrama de Dependencias entre Módulos

```
                        ┌──────────────┐
                        │  index.ts     │
                        │  (entry point)│
                        └──────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │ config/      │ │ server.ts    │ │ tools/       │
      │ index.ts     │ │              │ │ register.ts  │
      └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
             │                │                │
             │                ▼                │
             │        ┌──────────────┐         │
             │        │ transport/   │         │
             │        │ stdio-server │         │
             │        └──────────────┘         │
             │                                 │
             │              ┌──────────────────┘
             │              ▼
             │    ┌─────────────────────────────────────────┐
             │    │          tools/  (9 handlers)            │
             │    │  search-issues.ts  create-issue.ts      │
             │    │  update-issue.ts   transition-issue.ts  │
             │    │  get-sprints.ts    assign-user.ts       │
             │    │  manage-comments.ts attach-file.ts      │
             │    │  health-check.ts                       │
             │    └────────────────┬────────────────────────┘
             │                     │
             │         ┌───────────┼───────────┐
             │         ▼           ▼           ▼
             │  ┌──────────┐ ┌──────────┐ ┌──────────┐
             │  │ schemas/ │ │ services/│ │ utils/   │
             │  │ (9 zod)  │ │ jira-    │ │ errors.ts│
             │  │          │ │ client.ts│ │ retry.ts │
             │  └──────────┘ └────┬─────┘ │ sanitize │
             │                    │       └──────────┘
             │                    │
             └────────────────────┤
                                  ▼
                          ┌──────────────┐
                          │ auth/        │
                          │ index.ts     │
                          └──────┬───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │ types/       │
                          │ mcp.ts       │
                          │ jira.ts      │
                          │ index.ts     │
                          └──────────────┘
```

### Reglas de Dependencia

1. **`types/`** no depende de ningún otro módulo (hoja de dependencias).
2. **`config/`** depende solo de `types/` (lee env vars, construye JiraConfig).
3. **`auth/`** depende solo de `types/` (construye header Basic Auth).
4. **`utils/`** depende de `types/` (usa tipos de errores y config).
5. **`services/jira-client.ts`** depende de `auth/`, `utils/`, `types/`.
6. **`schemas/`** depende solo de `zod` y `types/` (opcional).
7. **`tools/`** depende de `schemas/`, `services/jira-client.ts`, `config/` (para host), y `types/`.
8. **`transport/`** depende del SDK MCP.
9. **`server.ts`** depende de `transport/` y `tools/register.ts`.
10. **`index.ts`** depende de `server.ts`, `config/`, `tools/register.ts`.

**Prohibido:**
- `tools/` no puede importar de otros `tools/` (cada handler es independiente).
- `schemas/` no puede importar de `tools/` (los schemas son autocontenidos).
- Ningún módulo puede importar de `index.ts` (entry point no es biblioteca).

---

## 4. Convenciones de Código por Capa

### 4.1 Tool Handlers (`src/tools/`)

```typescript
// Patrón de cada archivo en src/tools/
// Ejemplo: src/tools/search-issues.ts

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';
import { SearchIssuesInputSchema, type SearchIssuesInput } from '../schemas/search-issues.js';
import { buildJql, mapSearchResponse } from './search-issues-helpers.js'; // helpers en mismo archivo o subcarpeta
import type { IssueSearchResult } from '../types/index.js';

/**
 * Registra la tool "search_issues" en el MCP Server.
 * Cada archivo de tool exporta una función `register{Name}`.
 */
export function registerSearchIssues(
  server: McpServer,
  jiraClient: JiraClient
): void {
  server.tool(
    'search_issues',
    `Search for issues in Jira using JQL (Jira Query Language)...`,  // descripción
    SearchIssuesInputSchema.shape,  // inputSchema como JSON Schema
    async (input: SearchIssuesInput) => {
      // 1. Construir JQL
      const jql = buildJql(input);

      // 2. Llamar a Jira API
      const response = await jiraClient.post('/search', {
        jql,
        startAt: input.startAt ?? 0,
        maxResults: input.maxResults ?? 50,
        fields: input.fields ?? defaultFields,
      });

      // 3. Transformar respuesta
      const result: IssueSearchResult = mapSearchResponse(response.data, jiraClient.config.host);

      // 4. Retornar al agente
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    }
  );
}
```

**Reglas de handlers:**
- Una función exportada por archivo: `register{ToolName}(server, jiraClient)`.
- La función registra la tool mediante `server.tool(name, description, inputSchema, handler)`.
- El handler es `async` y retorna `{ content: [...] }`.
- Los errores se capturan en el handler y se convierten a `McpError`.
- Validación de entrada se hace automáticamente por el SDK MCP usando el schema Zod.
- No se hace `console.log` — usar el logger via `jiraClient.logger` o inyectado.

### 4.2 Schemas (`src/schemas/`)

```typescript
// Ejemplo: src/schemas/search-issues.ts
import { z } from 'zod';

export const SearchIssuesInputSchema = z.object({
  jql: z.string().optional().describe('Raw JQL query string...'),
  projectKey: z.string().optional().describe('Project key...'),
  // ... resto de campos
});

export type SearchIssuesInput = z.infer<typeof SearchIssuesInputSchema>;

export const SearchIssuesOutputSchema = z.object({
  total: z.number().int(),
  startAt: z.number().int(),
  maxResults: z.number().int(),
  issues: z.array(z.object({
    key: z.string(),
    id: z.string(),
    summary: z.string(),
    // ... resto de campos
  })),
});

export type SearchIssuesOutput = z.infer<typeof SearchIssuesOutputSchema>;
```

**Reglas de schemas:**
- Un archivo por tool en `src/schemas/`, nombrado igual que el archivo de tool.
- Cada schema file exporta `InputSchema`, `Input`, `OutputSchema`, `Output`.
- Solo depende de `zod`. No importa de `tools/` ni `services/`.

### 4.3 Cliente HTTP (`src/services/jira-client.ts`)

```typescript
// Ejemplo de interfaz pública
export class JiraClient {
  constructor(
    public readonly config: JiraConfig,
    private readonly logger: Logger
  ) {}

  async get<T>(path: string, query?: Record<string, unknown>): Promise<JiraApiResponse<T>>;
  async post<T>(path: string, body?: unknown, isFormData?: boolean): Promise<JiraApiResponse<T>>;
  async put<T>(path: string, body?: unknown): Promise<JiraApiResponse<T>>;
  async delete<T>(path: string): Promise<JiraApiResponse<T>>;
}

// Ejemplo de uso interno
async function executeRequest<T>(options: JiraRequestOptions): Promise<JiraApiResponse<T>> {
  const url = buildUrl(options);
  const headers = buildHeaders(options);

  return withRetry(
    async () => {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.isFormData ? options.body as FormData : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw mapJiraError(response.status, errorBody, options.path);
      }

      const data = await response.json();
      return { status: response.status, data, headers: sanitizeHeaders(Object.fromEntries(response.headers)) };
    },
    { maxRetries: 3, baseTimeoutMs: 30_000 }
  );
}
```

**Reglas del cliente HTTP:**
- Única instancia creada en `index.ts`, compartida con todos los handlers vía inyección.
- Todos los métodos HTTP usan `fetch` nativo de Node.js.
- La URL base se construye con `config.baseUrl` (v3) o `config.agileBaseUrl` (Agile).
- Headers de auth se construyen con `buildAuthHeader(config.email, config.apiToken)`.
- El API Token nunca se pasa como string a funciones de logging.
- Errores HTTP se traducen a `McpError` con mensajes accionables.

### 4.4 Utilidades

```typescript
// src/utils/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseTimeoutMs: number }
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === options.maxRetries) break;
      const waitMs = calculateBackoff(attempt, options.baseTimeoutMs, error);
      logger.warn({ attempt: attempt + 1, waitMs, error: String(error) }, 'Retrying Jira API request');
      await sleep(waitMs);
    }
  }
  throw lastError;
}

// src/utils/sanitize.ts
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };
  if ('authorization' in sanitized) sanitized['authorization'] = 'Basic [REDACTED]';
  if ('Authorization' in sanitized) sanitized['Authorization'] = 'Basic [REDACTED]';
  return sanitized;
}

export function redactToken(text: string, token: string): string {
  if (!token) return text;
  return text.replaceAll(token, '[REDACTED]');
}

// src/utils/errors.ts
export function mapJiraError(status: number, body: JiraErrorResponse, path: string): McpError {
  const messages = body.errorMessages?.join('; ') || body.errors ? JSON.stringify(body.errors) : 'Unknown error';

  switch (status) {
    case 401:
      return new JiraAuthError();
    case 403:
      return new McpError(ErrorCodes.SERVER_ERROR, `Access denied. Your account does not have permission for this action.`);
    case 404:
      return new McpError(ErrorCodes.SERVER_ERROR, `Resource not found at ${path}. Verify the identifier exists and you have access.`);
    case 429:
      throw { status, retryAfter: parseRetryAfter(body) };  // Capturado por withRetry
    default:
      if (status >= 500) {
        return new McpError(ErrorCodes.SERVER_ERROR, `Jira Cloud returned a server error (${status}). Try again later.`);
      }
      return new McpError(ErrorCodes.SERVER_ERROR, `Jira API error (${status}): ${messages}`);
  }
}
```

---

## 5. Convenciones de Archivos

### 5.1 Nombrado

| Tipo de archivo | Convención | Ejemplo |
|----------------|-----------|---------|
| Módulos fuente | `kebab-case.ts` | `search-issues.ts`, `jira-client.ts` |
| Tests unitarios | `{nombre}.test.ts` | `search-issues.test.ts`, `jira-client.test.ts` |
| Fixtures JSON | `kebab-case.json` | `search-issues.json`, `401-unauthorized.json` |
| Schemas Zod | `kebab-case.ts` | `search-issues.ts` (mismo nombre que el tool) |
| Tipos | `kebab-case.ts` | `mcp.ts`, `jira.ts` |

### 5.2 Exports

- **`index.ts` en raíz de carpeta:** re-exporta todos los símbolos públicos de la carpeta.
- **Funciones exportadas:** una función principal por archivo de tool (`register{Name}`).
- **Clases:** una clase por archivo, el archivo se nombra como la clase en kebab-case.
- **Interfaces y tipos:** pueden co-existir múltiples en un archivo si están relacionados.

### 5.3 Imports

- Usar extensiones `.js` en imports (requerido por ESM con `"type": "module"`):
  ```typescript
  import { JiraClient } from '../services/jira-client.js';
  ```
- Importar tipos con `import type` para evitar inclusiones en runtime:
  ```typescript
  import type { JiraConfig } from '../types/index.js';
  ```
- Agrupar imports: node built-ins, dependencias externas, módulos internos.

---

## 6. package.json

```json
{
  "name": "opencode-jira-mcp",
  "version": "1.0.0",
  "description": "MCP Server that exposes Jira Cloud API as tools for opencode AI agent",
  "type": "module",
  "main": "./dist/index.js",
  "bin": {
    "opencode-jira-mcp": "./dist/index.js"
  },
  "files": [
    "dist/",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/ tests/",
    "lint:fix": "eslint --fix src/ tests/",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\"",
    "prepare": "npm run build",
    "prepublishOnly": "npm test && npm run lint && npm run build"
  },
  "keywords": ["mcp", "jira", "atlassian", "opencode", "ai-agent"],
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "pino": "^9.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "eslint-config-prettier": "^9.0.0",
    "prettier": "^3.3.0",
    "typescript": "^5.5.0",
    "tsx": "^4.19.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  }
}
```

---

## 7. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": false,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 8. Ciclo de Vida de un Request

```
1. opencode spawnea: node dist/index.js
2. index.ts:
   a. Carga config con loadConfig() → JiraConfig
   b. Crea logger con createLogger() → Pino (stderr)
   c. Crea JiraClient con config + logger
   d. Crea McpServer con serverInfo { name: "opencode-jira-mcp", version: "1.0.0" }
   e. Registra 9 tools via registerAllTools(server, jiraClient, config)
   f. Conecta StdioServerTransport
   g. Queda esperando requests JSON-RPC en stdin

3. opencode envía tools/call (search_issues):
   stdin → McpServer → busca tool "search_issues"
   → Valida input con SearchIssuesInputSchema (Zod)
   → Si inválido: responde error -32602 con detalles
   → Si válido: ejecuta handler registrado

4. Handler:
   a. Construye JQL
   b. jiraClient.post('/search', { jql, startAt, maxResults, fields })
   c. jiraClient internamente:
      - buildAuthHeader(config.email, config.apiToken)
      - fetch(url, { method: 'POST', headers: { Authorization: 'Basic ...' }, body: JSON.stringify(payload) })
      - withRetry() en caso de 429 (hasta 3 intentos)
      - mapJiraError() en caso de error HTTP → McpError
   d. Si éxito: transforma respuesta a IssueSearchResult
   e. Retorna { content: [{ type: 'text', text: JSON.stringify(result) }] }

5. McpServer serializa respuesta como JSON-RPC 2.0 → stdout
```

---

## 9. Principios de Diseño Aplicados

| Principio | Aplicación |
|-----------|-----------|
| **Single Responsibility** | Cada archivo tiene una responsabilidad clara. Handlers solo orquestan; no hacen HTTP ellos mismos. |
| **Dependency Inversion** | Los handlers dependen de `JiraClient` (abstracción), no de `fetch` directamente. |
| **Open/Closed** | Añadir una nueva tool requiere: 1 archivo en `schemas/`, 1 archivo en `tools/`, 1 línea en `register.ts`. El cliente HTTP no se modifica. |
| **Interface Segregation** | Los tipos están separados por dominio (MCP, Jira) y no se mezclan. |
| **Fail Fast** | Validación Zod ocurre antes de cualquier llamada HTTP. |
| **Stateless** | El servidor no mantiene estado entre requests. Cada `tools/call` es independiente. |
