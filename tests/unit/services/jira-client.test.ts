import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JiraClient } from '../../../src/services/jira-client.js';
import { JiraAuthError, NetworkError } from '../../../src/utils/errors.js';
import type { JiraConfig } from '../../../src/types/index.js';
import type { Logger } from 'pino';

// ============================================================================
// T016 - Tests unitarios del cliente HTTP (JiraClient)
// ============================================================================

// Mock logger silencioso para tests
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  trace: () => {},
  silent: () => {},
  level: 'silent',
} as unknown as Logger;

const testConfig: JiraConfig = {
  host: 'test-company.atlassian.net',
  email: 'test@example.com',
  apiToken: 'test-api-token-123',
  baseUrl: 'https://test-company.atlassian.net/rest/api/3',
  agileBaseUrl: 'https://test-company.atlassian.net/rest/agile/1.0',
};

// Helper para crear un mock Response
function mockResponse(body: unknown, status: number): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers,
  } as Response;
}

function mockNetworkError(message: string): Error {
  const error = new Error(message);
  (error as unknown as Record<string, unknown>).cause = { code: 'ECONNREFUSED' };
  return error;
}

// Helper: provee N respuestas mock para soportar retries de withRetry
function mockFetchResponses(...responses: Response[]): void {
  for (const r of responses) {
    fetchSpy.mockResolvedValueOnce(r);
  }
}

// Variable compartida para el spy de fetch
let fetchSpy: ReturnType<typeof vi.fn>;

describe('JiraClient', () => {
  let client: JiraClient;

  beforeEach(() => {
    // baseTimeoutMs: 1 minimiza el tiempo de espera en retries para tests rapidos
    client = new JiraClient(testConfig, mockLogger, {
      baseTimeoutMs: 1,
      requestTimeoutMs: 5000,
      maxRetries: 3,
    });
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // =========================================================================
  // GET / POST / PUT / DELETE - caminos exitosos
  // =========================================================================

  describe('GET requests', () => {
    it('should make GET request with correct headers', async () => {
      // Arrange
      mockFetchResponses(mockResponse({ accountId: '123', displayName: 'Test User' }, 200));

      // Act
      const response = await client.get<{ accountId: string }>('/myself');

      // Assert
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ accountId: '123', displayName: 'Test User' });
      const fetchArgs = fetchSpy.mock.calls[0];
      const init = fetchArgs[1] as RequestInit;
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>)['Authorization']).toMatch(/^Basic\s.+/);
      expect((init.headers as Record<string, string>)['Accept']).toBe('application/json');
    });

    it('should handle query parameters in GET requests', async () => {
      // Arrange
      mockFetchResponses(mockResponse({ total: 0, issues: [] }, 200));

      // Act
      const response = await client.get('/search', {
        jql: 'project=PROJ',
        maxResults: 10,
        startAt: 0,
      });

      // Assert
      expect(response.status).toBe(200);
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('jql=project%3DPROJ');
      expect(url).toContain('maxResults=10');
      expect(url).toContain('startAt=0');
    });

    it('should skip undefined query parameters', async () => {
      // Arrange
      mockFetchResponses(mockResponse({ total: 0, issues: [] }, 200));

      // Act
      await client.get('/search', {
        jql: 'project=PROJ',
        maxResults: 10,
        startAt: undefined,
      });

      // Assert
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('jql=project%3DPROJ');
      expect(url).toContain('maxResults=10');
      expect(url).not.toContain('startAt');
    });
  });

  describe('POST requests', () => {
    it('should make POST request with JSON body', async () => {
      // Arrange
      const body = {
        fields: {
          project: { key: 'PROJ' },
          summary: 'Test issue',
          issuetype: { name: 'Bug' },
        },
      };
      mockFetchResponses(
        mockResponse(
          {
            id: '10001',
            key: 'PROJ-1',
            self: 'https://test-company.atlassian.net/rest/api/3/issue/PROJ-1',
          },
          201,
        ),
      );

      // Act
      const response = await client.post('/issue', body);

      // Assert
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('key', 'PROJ-1');
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify(body));
    });
  });

  describe('PUT requests', () => {
    it('should make PUT request', async () => {
      // Arrange
      const body = { fields: { summary: 'Updated summary' } };
      mockFetchResponses(mockResponse(undefined, 204));

      // Act
      const response = await client.put('/issue/PROJ-1', body);

      // Assert
      expect(response.status).toBe(204);
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('PUT');
      expect(init.body).toBe(JSON.stringify(body));
    });
  });

  describe('DELETE requests', () => {
    it('should make DELETE request', async () => {
      // Arrange
      mockFetchResponses(mockResponse(undefined, 204));

      // Act
      const response = await client.delete('/comment/PROJ-1/10001');

      // Assert
      expect(response.status).toBe(204);
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('DELETE');
    });
  });

  // =========================================================================
  // Error handling - withRetry reintenta 3 veces mas el inicial = 4 llamadas
  // =========================================================================

  describe('Error handling', () => {
    it('should throw JiraAuthError on 401 (after retries exhausted)', async () => {
      // Arrange: 4 responses 401 (initial + 3 retries)
      for (let i = 0; i < 4; i++) {
        mockFetchResponses(mockResponse({ errorMessages: ['Unauthorized'] }, 401));
      }

      // Act & Assert
      await expect(client.get('/myself')).rejects.toThrow(JiraAuthError);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('should throw error with access denied message on 403', async () => {
      // Arrange: 4 respuestas 403
      for (let i = 0; i < 4; i++) {
        mockFetchResponses(mockResponse({ errorMessages: ['Forbidden'] }, 403));
      }

      // Act & Assert
      await expect(client.get('/issue/PROJ-1')).rejects.toThrow(/Access denied|permission/);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('should throw error with not found message on 404', async () => {
      // Arrange: 4 respuestas 404
      for (let i = 0; i < 4; i++) {
        mockFetchResponses(mockResponse({ errorMessages: ['Issue not found'] }, 404));
      }

      // Act & Assert
      await expect(client.get('/issue/NOTEXIST-1')).rejects.toThrow(/not found/);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('should throw NetworkError on connection failure', async () => {
      // Arrange: fetch rechaza con error de red 4 veces
      for (let i = 0; i < 4; i++) {
        fetchSpy.mockRejectedValueOnce(mockNetworkError('connect ECONNREFUSED'));
      }

      // Act & Assert
      await expect(client.get('/myself')).rejects.toThrow(NetworkError);
    });

    it('should include error messages in the thrown error on 400', async () => {
      // Arrange: 4 respuestas 400
      for (let i = 0; i < 4; i++) {
        mockFetchResponses(mockResponse({ errorMessages: ['Invalid JQL: INVALID'] }, 400));
      }

      // Act & Assert
      await expect(client.get('/search', { jql: 'INVALID' })).rejects.toThrow(/Invalid JQL/);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });
  });

  // =========================================================================
  // Rate limiting - usa fake timers para evitar esperas reales de 30s
  // =========================================================================

  describe('Rate limiting', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should retry on 429 and eventually succeed', async () => {
      // Arrange: 2 respuestas 429 luego 200
      mockFetchResponses(mockResponse({ errorMessages: ['Rate limit exceeded'] }, 429));
      mockFetchResponses(mockResponse({ errorMessages: ['Rate limit exceeded'] }, 429));
      mockFetchResponses(mockResponse({ accountId: '123', displayName: 'Test User' }, 200));

      // Act
      const promise = client.get('/myself');

      // El 429 tiene retryAfter = 30000 (default de mapHttpError)
      await vi.advanceTimersByTimeAsync(30000);
      await vi.advanceTimersByTimeAsync(30000);

      const response = await promise;

      // Assert
      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries on persistent 429', async () => {
      // Arrange: 4 respuestas 429 (initial + 3 retries)
      for (let i = 0; i < 4; i++) {
        mockFetchResponses(mockResponse({ errorMessages: ['Rate limit exceeded'] }, 429));
      }

      // Act
      const promise = client.get('/myself');
      promise.catch(() => {}); // Previene unhandled rejection con fake timers

      await vi.advanceTimersByTimeAsync(30000); // retry 1
      await vi.advanceTimersByTimeAsync(30000); // retry 2
      await vi.advanceTimersByTimeAsync(30000); // retry 3

      // Assert - despues de 4 intentos, withRetry rechaza con el ultimo error
      await expect(promise).rejects.toThrow();
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });
  });

  // =========================================================================
  // Headers
  // =========================================================================

  describe('Headers', () => {
    it('should include Authorization header', async () => {
      // Arrange
      mockFetchResponses(mockResponse({}, 200));

      // Act
      await client.get('/myself');

      // Assert
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(init.headers).toHaveProperty('Authorization');
    });

    it('should include Accept header', async () => {
      // Arrange
      mockFetchResponses(mockResponse({}, 200));

      // Act
      await client.get('/myself');

      // Assert
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)['Accept']).toBe('application/json');
    });
  });

  // =========================================================================
  // Agile API
  // =========================================================================

  describe('Agile API', () => {
    it('should use agileBaseUrl when useAgileApi is enabled', () => {
      expect(client.config.agileBaseUrl).toBe('https://test-company.atlassian.net/rest/agile/1.0');
    });
  });
});
