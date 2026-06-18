# Test Report — opencode-jira-mcp v0.1.0

**Date**: 2026-06-13  
**Phase**: Test (Fase 5 de 7)  
**Status**: ✅ PASSED — Listo para producción  

---

## Resumen de ejecución

| Métrica | Valor |
|---------|-------|
| Test files | 12 pasados, 1 skipped |
| Total tests | **269 pasados**, 6 skipped |
| Contract tests | 44 nuevos (todos pasando) |
| Duration | ~1.5s |
| Framework | Vitest 2.1.9 + @vitest/coverage-v8 |

---

## Cobertura de código

### Totales

| Métrica | Coverage | Threshold | Status |
|---------|----------|-----------|--------|
| Statements | **89.56%** | 70% | ✅ |
| Branches | **82.83%** | 70% | ✅ |
| Functions | **87.50%** | 70% | ✅ |
| Lines | **89.56%** | 70% | ✅ |

### Cobertura por módulo

| Módulo | Stmts | Branch | Funcs | Lines | Evaluación |
|--------|-------|--------|-------|-------|-----------|
| `auth/index.ts` | 100% | 100% | 100% | 100% | ✅ Excelente |
| `config/index.ts` | 100% | 100% | 100% | 100% | ✅ Excelente |
| `services/jira-client.ts` | 97.16% | 87.80% | 100% | 97.16% | ✅ Bueno |
| `tools/assign-user.ts` | 86.20% | 75% | 50% | 86.20% | ✅ Aceptable |
| `tools/attach-file.ts` | 93.38% | 69.23% | 80% | 93.38% | ✅ Bueno |
| `tools/create-issue.ts` | 93.84% | 82.60% | 83.33% | 93.84% | ✅ Bueno |
| `tools/get-sprints.ts` | 90.72% | 72.41% | 85.71% | 90.72% | ✅ Bueno |
| `tools/health-check.ts` | 79.66% | 85.71% | 50% | 79.66% | ✅ Aceptable |
| `tools/manage-comments.ts` | 58.94% | 47.36% | 75% | 58.94% | ⚠️ Mejorable |
| `tools/search-issues.ts` | 91.30% | 70% | 75% | 91.30% | ✅ Bueno |
| `tools/transition-issue.ts` | 93.37% | 96.66% | 83.33% | 93.37% | ✅ Excelente |
| `tools/update-issue.ts` | 91.01% | 100% | 80% | 91.01% | ✅ Bueno |
| `types/index.ts` | 100% | 100% | 100% | 100% | ✅ Excelente |
| `utils/errors.ts` | 100% | 100% | 100% | 100% | ✅ Excelente |
| `utils/retry.ts` | 95.91% | 94.44% | 100% | 95.91% | ✅ Excelente |
| `utils/sanitize.ts` | 100% | 100% | 100% | 100% | ✅ Excelente |

### Módulos excluidos de cobertura (thin glue code)

| Módulo | Razón |
|--------|-------|
| `src/index.ts` | Entry point con `main()` — difícil de testear en unit |
| `src/tools/register.ts` | Solo imports y delegación de registro |
| `src/transport/stdio-server.ts` | Thin wrapper sobre SDK — requiere integración real |

---

## Pruebas de contrato MCP (C001-C003)

Se crearon **44 tests de contrato** en `tests/contract/mcp-contract.test.ts` que verifican:

### C001: Tool definitions compliance (27 tests)
- ✅ Las 9 tools serializan sus Zod schemas a JSON Schema válido
- ✅ Schemas con `strict()` generan `additionalProperties: false`
- ✅ `manage_comments` con `discriminatedUnion` genera `anyOf` válido
- ✅ Los campos `required` referencian propiedades existentes

### C002: Handler response format (17 tests)
- ✅ Todos los handlers devuelven `{ content: [{ type: "text", text: "..." }] }`
- ✅ El campo `text` contiene JSON válido y parseable
- ✅ Las respuestas incluyen los campos esperados según la tool
- ✅ `health_check` devuelve `status: "connected"` en caso exitoso
- ✅ `health_check` devuelve `status: "error"` con `isError: true` en fallo
- ✅ `transition_issue` devuelve `isError: true` cuando la transición no se encuentra
- ✅ `get_sprints` devuelve `isError: true` cuando el board no se encuentra

### C003: Error format compliance
- ✅ Los errores MCP incluyen `isError: true` y `content` con información accionable
- ✅ Los mensajes de error son human-readable

---

## Issues encontrados

### 1. Unhandled Rejections en tests de rate limit (⚠️ Baja prioridad)

**Descripción**: Los tests `should throw after max retries on persistent 429` en `jira-client.test.ts` y `jira-api.test.ts` generan advertencias de "Unhandled Rejection". Esto ocurre porque `mapHttpError` lanza un objeto plano (`{ status: 429, retryAfter: 30000 }`) en lugar de un `Error` para el código 429. El `withRetry` captura este throw, pero si el test no espera la promesa correctamente, vitest reporta el unhandled rejection.

**Impacto**: Solo advertencias, no causa fallos en los tests.  
**Recomendación**: Considerar que `mapHttpError` lance un `RateLimitError` u otro `McpError` en lugar de un objeto plano, para consistencia.

### 2. Cobertura de `manage-comments.ts` al 58.94% (⚠️ Media prioridad)

**Descripción**: Las funciones de extracción ADF (`extractCommentBody`, `plainTextToAdf`) y el registro MCP (`registerManageComments`) no tienen tests unitarios directos. Los handlers están testeados, pero los helpers ADF solo se prueban indirectamente.

**Impacto**: Bajo. Los helpers ADF se prueban implícitamente en los tests de handler.  
**Recomendación**: Añadir tests unitarios específicos para `extractCommentBody` y `plainTextToAdf` con diferentes formatos ADF.

### 3. Tests de `transition_issue` con `isError: true` no validan formato MCP (✅ Resuelto)

**Descripción**: Los tests de contract ahora verifican explícitamente que las respuestas de error cumplan el formato MCP. Anteriormente solo se verificaba en handlers.

**Impacto**: Resuelto con la creación de `tests/contract/mcp-contract.test.ts`.  
**Recomendación**: Mantener los contract tests como parte del CI.

---

## Estructura de pruebas

```
tests/
├── fixtures/
│   └── index.ts              # Mocks de dominio y respuestas Jira
├── unit/
│   ├── auth/index.test.ts     # T008 - Auth (5 tests)
│   ├── config/index.test.ts   # T006 - Config (8 tests)
│   ├── services/jira-client.test.ts  # T016 - HTTP Client (16 tests)
│   ├── tools/
│   │   ├── handlers.test.ts   # Tool handlers (47 tests)
│   │   ├── schemas.test.ts    # Zod schemas (78 tests)
│   │   └── search-issues.test.ts # Placeholder (1 test)
│   └── utils/
│       ├── errors.test.ts     # T010 - Errors (17 tests)
│       ├── retry.test.ts      # T012 - Rate limiting (8 tests)
│       └── sanitize.test.ts   # T014 - Sanitization (11 tests)
├── integration/
│   ├── jira-api.test.ts       # T042 - HTTP protocol (18 tests)
│   ├── jira-real.test.ts      # Real Jira API (6 tests, skipped)
│   └── token-safety.test.ts   # T043 - Token safety (16 tests)
└── contract/
    └── mcp-contract.test.ts   # C001-C003 - MCP Contract (44 tests)
```

---

## Recomendaciones

1. **CI Pipeline**: Incluir `npm run test:coverage` en CI con los thresholds actuales (70%). Los thresholds podrían subirse a 80% en la próxima iteración.

2. **contract tests en CI**: Añadir `npm run test:contract` como paso separado en CI para asegurar que el contrato MCP se mantiene.

3. **Mejora de cobertura**: Los módulos con cobertura < 80% son:
   - `manage-comments.ts` (58.94%): Añadir tests unitarios para helpers ADF
   - `health-check.ts` (79.66%): Cobertura de registro MCP (baja prioridad, es glue code)
   - `assign-user.ts` (86.20%): Cobertura de registro MCP (baja prioridad)

4. **Refactor de `mapHttpError`**: Cambiar el throw de objeto plano por código 429 a un `RateLimitError` para eliminar las advertencias de unhandled rejection.

5. **Mutation testing**: Considerar Stryker Mutator en futura iteración para validar calidad de assertions.

---

## Estado general

| Criterio | Evaluación |
|----------|-----------|
| Tests unitarios | ✅ 191 tests pasando |
| Tests de integración | ✅ 34 tests pasando (6 skipped por requerir Jira real) |
| Tests de contrato | ✅ 44 tests pasando |
| Cobertura statements | ✅ 89.56% |
| Cobertura branches | ✅ 82.83% |
| Cobertura functions | ✅ 87.50% |
| Formato de respuesta MCP | ✅ Verificado para las 9 tools |
| Manejo de errores MCP | ✅ Verificado con `isError: true` |
| JSON Schema compliance | ✅ Zod → JSON Schema válido |
| **VEREDICTO** | ✅ **LISTO PARA PRODUCCIÓN** |
