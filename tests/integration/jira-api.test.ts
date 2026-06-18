import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JiraClient } from '../../src/services/jira-client.js';
import { JiraAuthError, NetworkError, TimeoutError } from '../../src/utils/errors.js';
import type { JiraConfig } from '../../src/types/index.js';
import type { Logger } from 'pino';

// ============================================================================
// T042 - Integration tests: Jira API protocol (HTTP-level via fetch mocking)
// ============================================================================

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

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const h = new Headers({ 'content-type': 'application/json', ...extraHeaders });
  return { ok: status >= 200 && status < 300, status, json: async () => body, headers: h } as Response;
}

function netError(msg: string): Error {
  const err = new Error(msg);
  (err as unknown as Record<string, unknown>).code = 'ECONNREFUSED';
  return err;
}

describe('Integration: Jira API (fetch-mocked)', () => {
  let client: JiraClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new JiraClient(testConfig, mockLogger, {
      baseTimeoutMs: 1,
      requestTimeoutMs: 5000,
      maxRetries: 3,
    });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ===========================================================================
  // GET requests
  // ===========================================================================

  describe('GET requests', () => {
    it('should return user data on successful GET', async () => {
      // Arrange
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ accountId: '5f3a7b', displayName: 'Test User', emailAddress: 'test@example.com' }, 200),
      );

      // Act
      const response = await client.get('/myself');

      // Assert
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('accountId', '5f3a7b');
      expect(response.data).toHaveProperty('displayName', 'Test User');

      // Verify URL construction
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toBe('https://test-company.atlassian.net/rest/api/3/myself');
    });

    it('should propagate 401 JiraAuthError on all retries', async () => {
      // Arrange: 4 responses (initial + 3 retries)
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Unauthorized'] }, 401));
      }

      // Act & Assert
      await expect(client.get('/myself')).rejects.toThrow(JiraAuthError);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('should propagate 403 permission error on all retries', async () => {
      // Arrange
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Forbidden'] }, 403));
      }

      // Act & Assert
      await expect(client.get('/issue/SECRET-1')).rejects.toThrow(/Access denied/);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('should propagate 404 not found error with path', async () => {
      // Arrange
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Issue not found'] }, 404));
      }

      // Act & Assert
      await expect(client.get('/issue/NOTEXIST-1')).rejects.toThrow(/not found/);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('should propagate 500 server error on all retries', async () => {
      // Arrange
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Internal error'] }, 500));
      }

      // Act & Assert
      await expect(client.get('/myself')).rejects.toThrow(/server error/);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  // ===========================================================================
  // POST requests
  // ===========================================================================

  describe('POST requests', () => {
    it('should create an issue with POST', async () => {
      // Arrange
      const createBody = { fields: { project: { key: 'PROJ' }, summary: 'Test', issuetype: { name: 'Bug' } } };
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ id: '10099', key: 'PROJ-99', self: '...' }, 201),
      );

      // Act
      const response = await client.post('/issue', createBody);

      // Assert
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('key', 'PROJ-99');

      // Verify body was sent
      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify(createBody));
    });

    it('should handle 400 validation error on POST', async () => {
      // Arrange
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errors: { summary: 'Summary is required.' } }, 400));
      }

      // Act & Assert
      await expect(client.post('/issue', {})).rejects.toThrow(/Summary is required/);
    });
  });

  // ===========================================================================
  // PUT requests
  // ===========================================================================

  describe('PUT requests', () => {
    it('should update an issue with PUT (204 No Content)', async () => {
      // Arrange
      const updateBody = { fields: { summary: 'Updated title' } };
      fetchMock.mockResolvedValueOnce(jsonResponse(undefined, 204));

      // Act
      const response = await client.put('/issue/PROJ-1', updateBody);

      // Assert
      expect(response.status).toBe(204);
      expect(response.data).toBeUndefined();

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe('PUT');
    });
  });

  // ===========================================================================
  // DELETE requests
  // ===========================================================================

  describe('DELETE requests', () => {
    it('should delete a comment with DELETE', async () => {
      // Arrange
      fetchMock.mockResolvedValueOnce(jsonResponse(undefined, 204));

      // Act
      const response = await client.delete('/comment/PROJ-1/20001');

      // Assert
      expect(response.status).toBe(204);
      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe('DELETE');
    });
  });

  // ===========================================================================
  // Rate limiting (429) — uses fake timers to skip real waiting
  // ===========================================================================

  describe('Rate limiting (429)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should retry on 429 and eventually succeed', async () => {
      // Arrange: 2 x 429 then 200
      fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Rate limit exceeded'] }, 429));
      fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Rate limit exceeded'] }, 429));
      fetchMock.mockResolvedValueOnce(jsonResponse({ accountId: '123', displayName: 'Recovered' }, 200));

      // Act
      const promise = client.get('/myself');

      await vi.advanceTimersByTimeAsync(30000);
      await vi.advanceTimersByTimeAsync(30000);

      const response = await promise;

      // Assert
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('displayName', 'Recovered');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should throw after exhausting retries on 429', async () => {
      // Arrange: 4 x 429
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Rate limit exceeded'] }, 429));
      }

      // Act
      const promise = client.get('/myself');
      promise.catch(() => {}); // Previene unhandled rejection con fake timers

      await vi.advanceTimersByTimeAsync(30000);
      await vi.advanceTimersByTimeAsync(30000);
      await vi.advanceTimersByTimeAsync(30000);

      // Assert
      await expect(promise).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  // ===========================================================================
  // Network errors
  // ===========================================================================

  describe('Network errors', () => {
    it('should throw NetworkError on connection refused', async () => {
      // Arrange: 4 network failures
      for (let i = 0; i < 4; i++) {
        fetchMock.mockRejectedValueOnce(netError('connect ECONNREFUSED 127.0.0.1:443'));
      }

      // Act & Assert
      await expect(client.get('/myself')).rejects.toThrow(NetworkError);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('should throw TimeoutError on timeout', async () => {
      // Arrange: fetch never resolves (simulates AbortController timeout)
      // But we can't easily simulate a real AbortError with mocked fetch, so use delay
      fetchMock.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => {
              const err = new DOMException('The operation was aborted', 'AbortError');
              reject(err);
            }, 10);
          }),
      );

      // Act & Assert — with 4 retries, each timing out
      // The first AbortError is caught and thrown as TimeoutError
      await expect(client.get('/myself')).rejects.toThrow(TimeoutError);
    });
  });

  // ===========================================================================
  // Agile API
  // ===========================================================================

  describe('Agile API endpoints', () => {
    it('should use agileBaseUrl when useAgileApi is enabled', async () => {
      // Arrange
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ maxResults: 1, values: [{ id: 10, name: 'PROJ Scrum Board', type: 'scrum' }] }, 200),
      );

      // Act
      const response = await client.get<{ values: { id: number }[] }>(
        '/board',
        { name: 'PROJ Scrum Board' },
        { useAgileApi: true },
      );

      // Assert
      expect(response.status).toBe(200);
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toBe('https://test-company.atlassian.net/rest/agile/1.0/board?name=PROJ+Scrum+Board');
    });
  });

  // ===========================================================================
  // Query parameters
  // ===========================================================================

  describe('Query parameters', () => {
    it('should encode query parameters in URL', async () => {
      // Arrange
      fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, issues: [] }, 200));

      // Act
      await client.get('/search', {
        jql: 'project = PROJ',
        maxResults: 50,
        startAt: 0,
      });

      // Assert
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain('jql=project');
      expect(url).toContain('PROJ');
      expect(url).toContain('maxResults=50');
      expect(url).toContain('startAt=0');
    });

    it('should skip undefined query parameters', async () => {
      // Arrange
      fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, issues: [] }, 200));

      // Act
      await client.get('/search', {
        jql: 'project=PROJ',
        maxResults: undefined,
      });

      // Assert
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain('jql=project%3DPROJ');
      expect(url).not.toContain('maxResults');
    });
  });

  // ===========================================================================
  // FormData upload
  // ===========================================================================

  describe('FormData (file upload)', () => {
    it('should send FormData with correct headers', async () => {
      // Arrange
      const formData = new FormData();
      formData.append('file', new Blob(['test content']), 'test.txt');

      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ id: '30001', filename: 'test.txt' }], 200),
      );

      // Act
      const response = await client.post('/issue/PROJ-1/attachments', formData, true);

      // Assert
      expect(response.status).toBe(200);

      const init = fetchMock.mock.calls[0]![1] as RequestInit;
      // Content-Type should not be set to application/json for FormData
      expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    });
  });

  // ===========================================================================
  // Response headers
  // ===========================================================================

  describe('Response headers', () => {
    it('should return sanitized response headers', async () => {
      // Arrange
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ accountId: '123' }, 200, {
          'X-Request-Id': 'req-abc-123',
        }),
      );

      // Act
      const response = await client.get('/myself');

      // Assert
      expect(response.headers).toBeDefined();
      expect(response.headers['content-type']).toBe('application/json');
    });
  });
});
