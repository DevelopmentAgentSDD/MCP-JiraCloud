import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JiraClient } from '../../src/services/jira-client.js';
import { sanitizeHeaders, sanitizeConfigForLogging, redactToken } from '../../src/utils/sanitize.js';
import { loadConfig } from '../../src/config/index.js';
import type { JiraConfig } from '../../src/types/index.js';
import type { Logger } from 'pino';

// ============================================================================
// T043 - Token safety integration tests
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

const SENSITIVE_TOKEN = 'ATATT3xFfGF0z6Gabcdefghijklmnop1234567890';

const testConfig: JiraConfig = {
  host: 'test-company.atlassian.net',
  email: 'test@example.com',
  apiToken: SENSITIVE_TOKEN,
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

describe('Token Safety', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ===========================================================================
  // 1. Token never appears in error messages from JiraClient
  // ===========================================================================

  describe('Token in JiraClient error messages', () => {
    function createClient(): JiraClient {
      return new JiraClient(testConfig, mockLogger, {
        baseTimeoutMs: 1,
        requestTimeoutMs: 5000,
        maxRetries: 3,
      });
    }

    it('should not expose token in auth error (401) message', async () => {
      // Arrange: 4 x 401
      const client = createClient();
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Unauthorized'] }, 401));
      }

      // Act
      let errorMessage = '';
      try {
        await client.get('/myself');
      } catch (error: unknown) {
        errorMessage = error instanceof Error ? error.message : '';
      }

      // Assert
      expect(errorMessage).not.toContain(SENSITIVE_TOKEN);
      expect(errorMessage).not.toContain('ATATT');
    });

    it('should not expose token in 400 validation error message', async () => {
      // Arrange: 4 x 400
      const client = createClient();
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errors: { summary: 'Summary is required.' } }, 400));
      }

      // Act
      let errorMessage = '';
      try {
        await client.post('/issue', {});
      } catch (error: unknown) {
        errorMessage = error instanceof Error ? error.message : '';
      }

      // Assert
      expect(errorMessage).not.toContain(SENSITIVE_TOKEN);
      expect(errorMessage).not.toContain('ATATT');
    });

    it('should not expose token in network error message', async () => {
      // Arrange: 4 network errors
      const client = createClient();
      for (let i = 0; i < 4; i++) {
        fetchMock.mockRejectedValueOnce(netError('connect ECONNREFUSED'));
      }

      // Act
      let errorMessage = '';
      try {
        await client.get('/myself');
      } catch (error: unknown) {
        errorMessage = error instanceof Error ? error.message : '';
      }

      // Assert
      expect(errorMessage).not.toContain(SENSITIVE_TOKEN);
      expect(errorMessage).not.toContain('ATATT');
    });

    it('should not expose token in 404 error message', async () => {
      // Arrange: 4 x 404
      const client = createClient();
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Issue not found'] }, 404));
      }

      // Act
      let errorMessage = '';
      try {
        await client.get('/issue/NOTEXIST-1');
      } catch (error: unknown) {
        errorMessage = error instanceof Error ? error.message : '';
      }

      // Assert
      expect(errorMessage).not.toContain(SENSITIVE_TOKEN);
    });

    it('should not expose token in 500 error message', async () => {
      // Arrange: 4 x 500
      const client = createClient();
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Internal error'] }, 500));
      }

      // Act
      let errorMessage = '';
      try {
        await client.get('/myself');
      } catch (error: unknown) {
        errorMessage = error instanceof Error ? error.message : '';
      }

      // Assert
      expect(errorMessage).not.toContain(SENSITIVE_TOKEN);
    });

    it('should not expose token in rate limit error message', async () => {
      // Arrange: 4 x 429 — use fake timers to skip real 30s waits
      vi.useFakeTimers();
      const client = createClient();
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessages: ['Rate limit exceeded'] }, 429));
      }

      // Act
      let errorMessage = '';
      const promise = (async () => {
        try {
          await client.get('/myself');
        } catch (error: unknown) {
          errorMessage = error instanceof Error ? error.message : '';
        }
      })();

      // Advance past retry waits
      await vi.advanceTimersByTimeAsync(30000);
      await vi.advanceTimersByTimeAsync(30000);
      await vi.advanceTimersByTimeAsync(30000);
      await promise;

      // Assert
      expect(errorMessage).not.toContain(SENSITIVE_TOKEN);
      vi.useRealTimers();
    });
  });

  // ===========================================================================
  // 2. Headers sanitization hides Authorization
  // ===========================================================================

  describe('sanitizeHeaders', () => {
    it('should never expose the token in sanitized headers', () => {
      // Arrange
      const headers = {
        Authorization: `Basic ${Buffer.from(`test@example.com:${SENSITIVE_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/json',
      };

      // Act
      const sanitized = sanitizeHeaders(headers);

      // Assert
      expect(sanitized['Authorization']).toBe('Basic [REDACTED]');
      expect(JSON.stringify(sanitized)).not.toContain(SENSITIVE_TOKEN);
    });
  });

  // ===========================================================================
  // 3. Config sanitization always redacts token
  // ===========================================================================

  describe('sanitizeConfigForLogging', () => {
    it('should replace token with ***SET***', () => {
      // Arrange
      const config: JiraConfig = {
        host: 'test-company.atlassian.net',
        email: 'test@example.com',
        apiToken: SENSITIVE_TOKEN,
        baseUrl: 'https://test-company.atlassian.net/rest/api/3',
        agileBaseUrl: 'https://test-company.atlassian.net/rest/agile/1.0',
      };

      // Act
      const sanitized = sanitizeConfigForLogging(config);

      // Assert
      expect(sanitized.apiToken).toBe('***SET***');
      expect(JSON.stringify(sanitized)).not.toContain(SENSITIVE_TOKEN);
      expect(JSON.stringify(sanitized)).not.toContain('ATATT');
    });

    it('should show NOT SET for empty token', () => {
      // Arrange
      const config: JiraConfig = {
        host: 'test-company.atlassian.net',
        email: 'test@example.com',
        apiToken: '',
        baseUrl: 'https://test-company.atlassian.net/rest/api/3',
        agileBaseUrl: 'https://test-company.atlassian.net/rest/agile/1.0',
      };

      // Act
      const sanitized = sanitizeConfigForLogging(config);

      // Assert
      expect(sanitized.apiToken).toBe('NOT SET');
    });

    it('should not expose host or email in a way that compromises security', () => {
      // Arrange
      const config: JiraConfig = {
        host: 'my-company.atlassian.net',
        email: 'dev@company.com',
        apiToken: SENSITIVE_TOKEN,
        baseUrl: 'https://my-company.atlassian.net/rest/api/3',
        agileBaseUrl: 'https://my-company.atlassian.net/rest/agile/1.0',
      };

      // Act
      const sanitized = sanitizeConfigForLogging(config);

      // Assert
      expect(sanitized.host).toBe('my-company.atlassian.net');
      expect(sanitized.email).toBe('dev@company.com');
      expect(sanitized.apiToken).toBe('***SET***');
      expect(sanitized.apiToken).not.toContain(SENSITIVE_TOKEN);
    });
  });

  // ===========================================================================
  // 4. redactToken replaces all occurrences
  // ===========================================================================

  describe('redactToken', () => {
    it('should redact all occurrences of token in text', () => {
      // Arrange
      const text = `Request failed with token ${SENSITIVE_TOKEN}. The token ${SENSITIVE_TOKEN} was used in auth header.`;

      // Act
      const redacted = redactToken(text, SENSITIVE_TOKEN);

      // Assert
      expect(redacted).not.toContain(SENSITIVE_TOKEN);
      expect(redacted).toContain('[REDACTED]');
      // Should have 2 occurrences of [REDACTED]
      const occurrences = (redacted.match(/\[REDACTED\]/g) || []).length;
      expect(occurrences).toBe(2);
    });

    it('should not modify text when token is not present', () => {
      // Arrange
      const text = 'Normal error message without token';

      // Act
      const redacted = redactToken(text, SENSITIVE_TOKEN);

      // Assert
      expect(redacted).toBe(text);
    });

    it('should return unchanged text when token is empty', () => {
      // Arrange
      const text = 'Some text';

      // Act
      const redacted = redactToken(text, '');

      // Assert
      expect(redacted).toBe(text);
    });

    it('should handle token with special regex characters', () => {
      // Arrange
      const specialToken = 'test.token+special*chars?';
      const text = `Using token ${specialToken} here`;

      // Act
      const redacted = redactToken(text, specialToken);

      // Assert
      expect(redacted).not.toContain(specialToken);
      expect(redacted).toContain('[REDACTED]');
    });
  });

  // ===========================================================================
  // 5. JiraClient response headers are sanitized
  // ===========================================================================

  describe('JiraClient header safety', () => {
    it('should sanitize Authorization header in response headers', async () => {
      // Arrange
      const client = new JiraClient(testConfig, mockLogger, {
        baseTimeoutMs: 1,
        requestTimeoutMs: 5000,
        maxRetries: 3,
      });

      fetchMock.mockResolvedValueOnce(
        jsonResponse({ accountId: '123' }, 200, {
          authorization: `Basic ${Buffer.from(`test@example.com:${SENSITIVE_TOKEN}`).toString('base64')}`,
          'content-type': 'application/json',
        }),
      );

      // Act
      const response = await client.get('/myself');

      // Assert
      const responseHeaders = JSON.stringify(response.headers);
      expect(responseHeaders).not.toContain(SENSITIVE_TOKEN);
      if (response.headers['authorization']) {
        expect(response.headers['authorization']).toBe('Basic [REDACTED]');
      }
    });
  });

  // ===========================================================================
  // 6. loadConfig error messages don't expose env var values
  // ===========================================================================

  describe('Config error message safety', () => {
    it('should not expose token value in config validation errors', () => {
      // Arrange: set missing env vars but with token present
      process.env.JIRA_HOST = 'test.atlassian.net';
      process.env.JIRA_API_TOKEN = SENSITIVE_TOKEN;
      // Deliberately missing JIRA_EMAIL

      try {
        // Act
        loadConfig();
        // If no error, test should fail
        expect('should have thrown').toBe('but did not');
      } catch (error: unknown) {
        // Assert
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain(SENSITIVE_TOKEN);
        expect(message).not.toContain('ATATT');
        expect(message).toContain('JIRA_EMAIL');
      }

      // Cleanup
      delete process.env.JIRA_HOST;
      delete process.env.JIRA_API_TOKEN;
    });
  });
});
