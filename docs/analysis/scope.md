# Scope Definition — opencode-jira-mcp

> **Proyecto:** opencode-jira-mcp  
> **Tipo:** MCP (Model Context Protocol) Server  
> **Stack:** TypeScript + Node.js + @modelcontextprotocol/sdk  
> **API destino:** Jira Cloud REST API v3  
> **Versión:** MVP v1.0.0  
> **Fecha:** 2026-06-13  

---

## 1. Visión General

**opencode-jira-mcp** es un MCP Server que expone la API de Jira Cloud como herramientas (tools) consumibles desde opencode (AI coding agent). El agente de IA podrá buscar, crear, actualizar y gestionar issues de Jira sin salir del contexto de desarrollo, interactuando con el MCP a través del protocolo estándar MCP sobre stdio.

### Objetivo del MVP

Permitir que opencode realice operaciones CRUD completas sobre issues de Jira Cloud, consulte sprints, gestione comentarios y archivos adjuntos, todo mediante interacción en lenguaje natural que el agente traduce a llamadas estructuradas al MCP.

---

## 2. Alcance Funcional — MVP

### 2.1 Tools expuestas al agente

| # | Tool MCP | Descripción | Prioridad |
|---|----------|-------------|-----------|
| T1 | `search_issues` | Búsqueda avanzada con JQL, filtros, paginación | P0 |
| T2 | `create_issue` | Crear tareas, bugs, historias, épicas | P0 |
| T3 | `update_issue` | Modificar campos, estado, asignación, prioridad | P0 |
| T4 | `transition_issue` | Mover issues entre estados del workflow | P0 |
| T5 | `get_sprints` | Listar sprints activos/futuros y sus issues | P1 |
| T6 | `assign_user` | Asignar o quitar responsable de un issue | P1 |
| T7 | `manage_comments` | Leer y escribir comentarios en issues | P1 |
| T8 | `attach_file` | Subir archivos adjuntos a issues | P2 |

### 2.2 Detalle por herramienta

#### T1 — `search_issues`
- JQL completo (igual que en la UI de Jira)
- Filtros: project, type, status, assignee, priority, labels, sprint, text
- Paginación: `startAt` + `maxResults` (por defecto 50)
- Ordenamiento: `orderBy` (campo + ASC/DESC)
- Respuesta: lista de issues con campos seleccionables (`fields` parameter)

#### T2 — `create_issue`
- Campos obligatorios: `projectKey`, `summary`, `issueType` (Task, Bug, Story, Epic)
- Campos opcionales: `description`, `priority`, `assignee`, `labels`, `components`, `sprint`, `parent` (para subtareas), `epicLink`
- Soporte para campos personalizados (`customfield_XXXXX`)
- Respuesta: issue creado con key, id y URL

#### T3 — `update_issue`
- Identificación: `issueKey` o `issueId`
- Campos editables: `summary`, `description`, `priority`, `assignee`, `labels`, `components`, `customFields`
- Validación: solo campos modificables según el workflow actual
- Respuesta: confirmación con campos actualizados

#### T4 — `transition_issue`
- Identificación: `issueKey` o `issueId`
- Parámetros: `transitionName` o `transitionId`
- Descubrimiento: capacidad de listar transiciones disponibles para un issue
- Validación: transición permitida en el estado actual
- Respuesta: confirmación con nuevo estado

#### T5 — `get_sprints`
- Filtros: `boardId`, `state` (active, future, closed)
- Información: nombre, objetivo, fechas (start/end), capacidad, issues incluidos
- Respuesta: lista de sprints con contador de issues y progreso

#### T6 — `assign_user`
- Identificación: `issueKey` o `issueId`
- Parámetros: `accountId` del usuario (o `null` para desasignar)
- Validación: usuario existente y con permisos en el proyecto
- Respuesta: confirmación de asignación

#### T7 — `manage_comments`
- Sub-operaciones: `list` (leer) y `add` (escribir)
- `list`: devuelve todos los comentarios de un issue
- `add`: requiere `issueKey` y `body` (texto o markdown)
- Soporte para @menciones a usuarios de Jira
- Respuesta: lista de comentarios o confirmación del nuevo

#### T8 — `attach_file`
- Identificación: `issueKey` o `issueId`
- Entrada: ruta local al archivo o contenido binario
- Tipos soportados: imágenes, PDF, documentos, logs (según límites de Jira)
- Validación: tamaño máximo (10 MB por defecto en Jira Cloud)
- Respuesta: confirmación con nombre del archivo y URL

---

## 3. Requisitos No Funcionales

| ID | Requisito | Criterio de aceptación |
|----|-----------|------------------------|
| NF1 | **Seguridad del token** | El API Token nunca aparece en logs, errores ni respuestas al agente |
| NF2 | **Configuración externa** | 100% de la configuración vía variables de entorno (`JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) |
| NF3 | **Manejo de errores** | Cada error de la API de Jira se traduce a un mensaje descriptivo para el agente |
| NF4 | **Rate limiting** | Respetar los límites de rate de Jira Cloud API; reintentos con backoff exponencial |
| NF5 | **Portabilidad** | Instalable vía `npm install -g` y ejecutable vía `npx` sin pasos adicionales |
| NF6 | **Documentación** | README con instrucciones de instalación, configuración, uso y ejemplos para cada tool |
| NF7 | **Transporte** | Comunicación exclusiva por stdio (standard input/output) según MCP |
| NF8 | **Tipado fuerte** | Todas las entradas/salidas de tools con schemas Zod estrictos |
| NF9 | **Logging** | Logs estructurados en stderr para no interferir con stdio (que es el canal MCP) |
| NF10 | **Idempotencia** | Operaciones de creación con detección de duplicados vía clave natural cuando sea posible |

---

## 4. Exclusiones Explícitas (Out of Scope para MVP)

| # | Elemento excluido | Justificación |
|---|-------------------|---------------|
| E1 | **Autenticación OAuth 2.0 (3LO)** | Complejidad adicional; el API Token cubre el 90% de casos de uso |
| E2 | **Webhooks / eventos en tiempo real** | El MVP es pull-based (el agente consulta); los webhooks requieren un endpoint HTTP expuesto |
| E3 | **Soporte para Jira Server / Data Center** | Solo Jira Cloud; la API de Server/DC difiere significativamente y duplicaría el esfuerzo |
| E4 | **Gestión de proyectos (CRUD de proyectos)** | No se requieren crear/eliminar proyectos; solo operar dentro de proyectos existentes |
| E5 | **Gestión de usuarios** | Solo asignación; no se crean, editan ni eliminan usuarios |
| E6 | **Tableros Kanban/Scrum (CRUD)** | Solo consulta de sprints; no se crean ni configuran tableros |
| E7 | **Workflows personalizados (CRUD)** | Solo ejecución de transiciones existentes |
| E8 | **Reportes avanzados / dashboards** | Fuera del alcance de un MCP de interacción táctica |
| E9 | **Notificaciones push al agente** | MCP no define un mecanismo de push en stdio |
| E10 | **Caché local de datos de Jira** | El MVP consulta siempre en tiempo real; la caché añade complejidad de invalidación |

---

## 5. Suposiciones y Restricciones

### Suposiciones
1. El usuario tiene una cuenta de Atlassian con API Token generado (https://id.atlassian.com/manage/api-tokens)
2. El usuario tiene permisos suficientes en los proyectos de Jira destino
3. El Jira Cloud instance es accesible desde la máquina donde corre opencode
4. opencode soporta el protocolo MCP y puede invocar tools vía stdio
5. Los archivos a adjuntar son accesibles desde el sistema de archivos local

### Restricciones técnicas
1. **Node.js >= 18 LTS** requerido por el SDK de MCP
2. **npm** como gestor de paquetes (no yarn, no pnpm en MVP)
3. **stdio** como único transporte MCP (no SSE, no WebSocket)
4. **Jira Cloud REST API v3** como única API destino (no v2)
5. **Sin dependencia de bases de datos** locales (stateless server)

---

## 6. Roadmap Post-MVP

| Fase | Funcionalidades | Prioridad |
|------|----------------|-----------|
| v1.1 | Soporte para JQL avanzado con autocompletado de campos | Media |
| v1.1 | Búsqueda de usuarios (`find_user` tool) | Media |
| v1.2 | Soporte para OAuth 2.0 (3LO) | Baja |
| v1.2 | Webhooks para notificaciones de cambios en issues | Baja |
| v2.0 | Gestión completa de proyectos y tableros | Baja |
| v2.0 | Caché inteligente con invalidación por webhook | Baja |

---

## 7. Métricas de Éxito del MVP

1. Las 8 tools descritas funcionan correctamente contra una instancia real de Jira Cloud
2. El 100% de los errores de la API de Jira se traducen a mensajes comprensibles para el agente
3. El API Token nunca se filtra en logs, errores ni respuestas (verificable por revisión de código)
4. La instalación desde cero toma menos de 5 minutos (npm install + 3 variables de entorno)
5. El servidor MCP pasa la validación contra el MCP Inspector oficial
