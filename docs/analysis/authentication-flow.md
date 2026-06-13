# Authentication Flow — opencode-jira-mcp

> **Proyecto:** opencode-jira-mcp  
> **Tipo:** MCP Server para Jira Cloud  
> **Mecanismo de autenticación:** Atlassian API Token (Basic Auth)  
> **Versión:** MVP v1.0.0  
> **Fecha:** 2026-06-13  

---

## 1. Mecanismo de Autenticación Seleccionado

### API Token de Atlassian (Basic HTTP Authentication)

Jira Cloud soporta varios mecanismos de autenticación. Para el MVP se ha seleccionado **API Token + Basic Auth** por:

| Criterio | API Token | OAuth 2.0 (3LO) | OAuth 2.0 (2LO) |
|----------|-----------|-----------------|-----------------|
| **Complejidad de implementación** | Baja | Alta | Media |
| **Configuración del usuario** | 2 min (generar token) | 15 min (app OAuth) | 10 min (app link) |
| **Requisitos de infraestructura** | Ninguno | Callback URL | Ninguno |
| **Adecuado para CLI/headless** | Sí | No (requiere browser) | Sí |
| **Rotación de credenciales** | Manual | Automática (refresh) | Automática |
| **Alcance del MVP** | ✅ Seleccionado | ❌ Post-MVP | ❌ Post-MVP |

### Referencia oficial
https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/

---

## 2. Modelo de Configuración

### 2.1 Variables de Entorno

El MCP Server requiere exactamente **3 variables de entorno**:

| Variable | Descripción | Ejemplo | Obligatoria |
|----------|-------------|---------|-------------|
| `JIRA_HOST` | Dominio de la instancia Jira Cloud (sin protocolo ni path) | `mi-empresa.atlassian.net` | ✅ Sí |
| `JIRA_EMAIL` | Email de la cuenta de Atlassian | `usuario@empresa.com` | ✅ Sí |
| `JIRA_API_TOKEN` | Token de API generado en Atlassian | `ATATT3xFf...` | ✅ Sí |

### 2.2 Configuración en opencode.json

El usuario configura el MCP Server en su `opencode.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "opencode-jira-mcp"],
      "env": {
        "JIRA_HOST": "mi-empresa.atlassian.net",
        "JIRA_EMAIL": "usuario@empresa.com",
        "JIRA_API_TOKEN": "ATATT3xFfGF0..."
      }
    }
  }
}
```

> **Nota de seguridad:** El token en `opencode.json` solo es visible para el usuario local. No debe commitearse a repositorios. Se recomienda usar un gestor de secretos o variables de entorno del sistema para producción.

### 2.3 Alternativa: Variables de Entorno del Sistema

```powershell
# Windows PowerShell
$env:JIRA_HOST = "mi-empresa.atlassian.net"
$env:JIRA_EMAIL = "usuario@empresa.com"
$env:JIRA_API_TOKEN = "ATATT3xFfGF0..."

npx opencode-jira-mcp
```

---

## 3. Flujo de Autenticación

### 3.1 Diagrama de Secuencia

```
User                opencode.json         MCP Server              Jira Cloud
 │                       │                     │                       │
 │  1. Configuración     │                     │                       │
 │  Escribe token en     │                     │                       │
 │  opencode.json ──────▶│                     │                       │
 │                       │                     │                       │
 │  2. Inicia opencode   │                     │                       │
 │──────────────────────▶│                     │                       │
 │                       │  Spawn process      │                       │
 │                       │────────────────────▶│                       │
 │                       │                     │                       │
 │                       │                     │ 3. Startup            │
 │                       │                     │ Read env vars:        │
 │                       │                     │  JIRA_HOST = "..."    │
 │                       │                     │  JIRA_EMAIL = "..."   │
 │                       │                     │  JIRA_API_TOKEN="..." │
 │                       │                     │                       │
 │                       │                     │ 4. Validate config    │
 │                       │                     │ ┌───────────────────┐ │
 │                       │                     │ │ JIRA_HOST: ✓      │ │
 │                       │                     │ │ JIRA_EMAIL: ✓     │ │
 │                       │                     │ │ JIRA_API_TOKEN: ✓ │ │
 │                       │                     │ └───────────────────┘ │
 │                       │                     │                       │
 │                       │                     │ 5. Lazy validation    │
 │                       │                     │ (No se valida en      │
 │                       │                     │  startup — solo al    │
 │                       │                     │  primer tools/call)   │
 │                       │                     │                       │
 │  "Find my bugs"       │                     │                       │
 │──────────────────────▶│                     │                       │
 │                       │  tools/call         │                       │
 │                       │────────────────────▶│                       │
 │                       │                     │                       │
 │                       │                     │ 6. Build Auth Header  │
 │                       │                     │ email:token → Base64  │
 │                       │                     │                       │
 │                       │                     │ GET /rest/api/3/      │
 │                       │                     │   myself              │
 │                       │                     │ Authorization:        │
 │                       │                     │   Basic base64(email: │
 │                       │                     │   token)              │
 │                       │                     │──────────────────────▶│
 │                       │                     │                       │
 │                       │                     │        200 OK         │
 │                       │                     │  {                    │
 │                       │                     │    "accountId": "...",│
 │                       │                     │    "displayName":"...│
 │                       │                     │    "emailAddress":"..│
 │                       │                     │  }                    │
 │                       │                     │◀──────────────────────│
 │                       │                     │                       │
 │                       │                     │  ✓ Auth valid         │
 │                       │                     │  → proceed with       │
 │                       │                     │    requested tool     │
 │                       │                     │                       │
```

### 3.2 Construcción del Header HTTP

```typescript
// Conceptual — no implementación final
function buildAuthHeader(email: string, apiToken: string): string {
  const credentials = `${email}:${apiToken}`;
  const encoded = Buffer.from(credentials).toString('base64');
  return `Basic ${encoded}`;
}

// Uso en cada request HTTP a Jira
const headers = {
  'Authorization': buildAuthHeader(env.JIRA_EMAIL, env.JIRA_API_TOKEN),
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};
```

---

## 4. Validación de Credenciales

### 4.1 Estrategia: Lazy Validation

El MCP Server **no valida las credenciales en el startup** por dos razones:

1. **Principio de mínimo privilegio en tiempo:** No se hace una llamada HTTP innecesaria si el agente nunca invoca tools de Jira en la sesión.
2. **Resiliencia:** Si Jira está temporalmente inaccesible en el startup, el MCP Server igual debe poder iniciar.

En su lugar, la validación ocurre en el **primer `tools/call`** (o explícitamente vía `jira_health_check`).

### 4.2 Flujo de Validación Lazy

```
Primer tools/call recibido
        │
        ▼
┌──────────────────┐
│ ¿Credenciales    │
│ ya validadas?    │──── Sí ───▶ Proceder con el tool handler
│                  │
└─────── No ───────┘
        │
        ▼
┌──────────────────────────┐
│ GET /rest/api/3/myself   │
│ (llamada de validación)  │
└──────────┬───────────────┘
           │
    ┌──────┴──────┐
    ▼              ▼
  200 OK        401/403
    │              │
    ▼              ▼
 Marcar como    Error: "Authentication
 "validada"     failed. Verify JIRA_EMAIL
                and JIRA_API_TOKEN."
 Proceder con   (No se reintenta — el token
 el tool        es inválido y debe corregirse)
```

### 4.3 Health Check Explícito

El agente puede invocar `jira_health_check` para validar credenciales proactivamente sin ejecutar una operación de negocio:

```
Agent: tools/call { name: "jira_health_check" }
         │
         ▼
   GET /rest/api/3/myself
         │
    ┌────┴────┐
    ▼         ▼
  200       401
    │         │
    ▼         ▼
  {          {
    status:    status:
    "connected" "error",
  }            message: "..."
             }
```

---

## 5. Manejo de Errores de Autenticación

### 5.1 Matriz de Errores

| Código HTTP | Significado | Causa probable | Mensaje al agente |
|-------------|-------------|----------------|-------------------|
| **401** | Unauthorized | Token inválido, email incorrecto, token revocado | `"Authentication failed. Verify JIRA_EMAIL and JIRA_API_TOKEN. Generate a new token at https://id.atlassian.com/manage/api-tokens"` |
| **403** | Forbidden | El usuario no tiene permisos en el recurso solicitado | `"Access denied. Your account does not have permission to perform this action on the requested resource."` |
| **404** | Not Found | Recurso inexistente (no es error de auth, pero puede confundirse) | `"[Resource] not found. Verify the [ID/key] exists and you have access to it."` |

### 5.2 Sanitización del Token en Errores

```typescript
// ❌ NUNCA hacer esto
console.error(`Auth failed with token: ${apiToken}`);

// ❌ NUNCA incluir el header Authorization en logs
logger.error({ headers: requestHeaders }); // headers incluye Authorization!

// ✅ SIEMPRE sanitizar
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };
  if (sanitized['Authorization']) {
    sanitized['Authorization'] = 'Basic [REDACTED]';
  }
  return sanitized;
}

// ✅ Log seguro
logger.error({
  message: `Jira API returned ${statusCode}`,
  status: statusCode,
  endpoint: url,
  // Authorization header NUNCA se incluye
});
```

---

## 6. Seguridad del Token

### 6.1 Principios

1. **El token nunca se escribe a disco** (excepto en `opencode.json` por el usuario)
2. **El token nunca aparece en stdout** (canal JSON-RPC hacia opencode)
3. **El token nunca aparece en stderr** (canal de logs)
4. **El token nunca se incluye en respuestas de error** al agente
5. **El token solo existe en memoria** durante la construcción del header HTTP

### 6.2 Reglas de Implementación

```typescript
// ✅ Correcto: el token se usa solo para construir el header
const token = process.env.JIRA_API_TOKEN;  // leído una vez en startup
const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

// ✅ Correcto: serialización segura para debug (nunca en producción)
function debugConfig(): Record<string, string> {
  return {
    JIRA_HOST: process.env.JIRA_HOST || 'NOT SET',
    JIRA_EMAIL: process.env.JIRA_EMAIL || 'NOT SET',
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN ? '***SET***' : 'NOT SET',
  };
}

// ❌ Incorrecto: pasar el objeto process.env completo a un logger
logger.info({ env: process.env }); // EXPONE el token en logs!

// ❌ Incorrecto: incluir config en respuestas MCP
return {
  content: [{
    type: 'text',
    text: `Connected to ${env.JIRA_HOST} as ${env.JIRA_EMAIL} with token ${env.JIRA_API_TOKEN}`
  }]
};
```

### 6.3 Prueba de Seguridad (Security Test Case)

```
GIVEN el MCP Server está corriendo con JIRA_API_TOKEN configurado
WHEN ocurre cualquier error (red, auth, validación, runtime)
THEN la salida stdout NO debe contener el valor del token
AND la salida stderr NO debe contener el valor del token
AND la respuesta JSON-RPC de error NO debe contener el valor del token
```

---

## 7. Ciclo de Vida del Token

```
┌─────────────────────────────────────────────────────────────┐
│                    Ciclo de Vida del API Token               │
│                                                             │
│  1. GENERACIÓN (Usuario)                                    │
│     Usuario visita: https://id.atlassian.com/manage/api-tokens
│     Clica "Create API token"                                │
│     Copia el token generado (solo se muestra UNA vez)       │
│                         │                                   │
│                         ▼                                   │
│  2. CONFIGURACIÓN (Usuario)                                 │
│     Pega el token en opencode.json o variable de entorno    │
│                         │                                   │
│                         ▼                                   │
│  3. USO (MCP Server)                                        │
│     - Lee JIRA_API_TOKEN del entorno en startup             │
│     - Construye header Basic Auth por cada request HTTP     │
│     - NUNCA persiste, loguea ni expone el token             │
│                         │                                   │
│                         ▼                                   │
│  4. REVOCACIÓN (Usuario)                                    │
│     Usuario visita: https://id.atlassian.com/manage/api-tokens
│     Clica "Revoke" sobre el token                           │
│     → MCP Server recibe 401 en el siguiente request         │
│     → Informa al agente: "Authentication failed..."         │
│                                                             │
│  5. ROTACIÓN (Usuario)                                      │
│     Usuario genera un nuevo token                           │
│     Actualiza la variable de entorno                        │
│     Reinicia opencode (o el MCP Server)                     │
│                                                             │
│  ⚠️ Los tokens NO expiran automáticamente en Atlassian.     │
│     El usuario es responsable de rotarlos periódicamente.   │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Configuración Paso a Paso para el Usuario

### Quick Start (README)

```markdown
## Authentication Setup

1. **Generate an API token:**
   - Go to https://id.atlassian.com/manage/api-tokens
   - Click "Create API token"
   - Give it a label (e.g., "opencode-jira-mcp")
   - Copy the generated token (you won't see it again!)

2. **Configure the MCP server in opencode.json:**

   \`\`\`json
   {
     "mcpServers": {
       "jira": {
         "command": "npx",
         "args": ["-y", "opencode-jira-mcp"],
         "env": {
           "JIRA_HOST": "your-company.atlassian.net",
           "JIRA_EMAIL": "you@company.com",
           "JIRA_API_TOKEN": "past-your-token-here"
         }
       }
     }
   }
   \`\`\`

3. **Verify the connection:**

   Once opencode starts, you can verify connectivity:

   \`\`\`
   @jira check if the Jira connection is working
   \`\`\`

   opencode will invoke the \`jira_health_check\` tool which calls
   \`GET /rest/api/3/myself\` and confirms your identity.

## Security Notes

- **Never commit your API token** to version control
- **Use environment variables** or a secret manager in CI/CD
- **Rotate your token** periodically from the Atlassian dashboard
- The MCP server **never logs** your token — all logs show `[REDACTED]`
```

---

## 9. Futuro: OAuth 2.0 (Post-MVP)

Para la versión post-MVP se evaluará el soporte de OAuth 2.0 (3LO) que permitiría:

- **Refresh tokens** para sesiones de larga duración sin intervención del usuario
- **Scopes granulares** (solo lectura, solo proyectos específicos)
- **Integración con CI/CD** sin exponer credenciales personales

La arquitectura actual está diseñada para que el cliente HTTP sea intercambiable:

```typescript
interface JiraAuthProvider {
  getAuthHeaders(): Promise<Record<string, string>>;
  validateCredentials(): Promise<boolean>;
}

class ApiTokenAuth implements JiraAuthProvider { /* MVP */ }
class OAuth2ThreeLeggedAuth implements JiraAuthProvider { /* Post-MVP */ }
```
