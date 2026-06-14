import { describe, it, expect } from 'vitest';
import {
  McpError,
  JiraAuthError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  ValidationError,
  mapHttpError,
} from '../../../src/utils/errors.js';
import { ErrorCodes } from '../../../src/types/index.js';

// ============================================================================
// T010 - Tests unitarios de errores
// ============================================================================

describe('Errors', () => {
  describe('McpError', () => {
    it('should create McpError with code and message', () => {
      // Arrange
      const code = ErrorCodes.INTERNAL_ERROR;
      const message = 'Something went wrong';

      // Act
      const error = new McpError(code, message);

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(McpError);
      expect(error.name).toBe('McpError');
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    });

    it('should create McpError with optional data', () => {
      // Arrange
      const code = ErrorCodes.INVALID_PARAMS;
      const message = 'Invalid input';
      const data = { field: 'name', issue: 'required' };

      // Act
      const error = new McpError(code, message, data);

      // Assert
      expect(error.data).toEqual(data);
    });

    it('should convert to JsonRpcError via toJsonRpcError()', () => {
      // Arrange
      const error = new McpError(-32603, 'Server error', { detail: 'db timeout' });

      // Act
      const jsonRpcError = error.toJsonRpcError();

      // Assert
      expect(jsonRpcError).toHaveProperty('code', -32603);
      expect(jsonRpcError).toHaveProperty('message', 'Server error');
      expect(jsonRpcError).toHaveProperty('data', { detail: 'db timeout' });
    });
  });

  describe('JiraAuthError', () => {
    it('should create JiraAuthError with code -32000', () => {
      // Act
      const error = new JiraAuthError();

      // Assert
      expect(error).toBeInstanceOf(McpError);
      expect(error.name).toBe('JiraAuthError');
      expect(error.code).toBe(ErrorCodes.SERVER_ERROR);
      expect(error.message).toContain('Authentication failed');
      expect(error.message).toContain('api-tokens');
    });

    it('should accept custom message', () => {
      // Act
      const error = new JiraAuthError('Custom auth error');

      // Assert
      expect(error.message).toBe('Custom auth error');
    });
  });

  describe('RateLimitError', () => {
    it('should create RateLimitError with retries attempted info', () => {
      // Arrange
      const retriesAttempted = 3;

      // Act
      const error = new RateLimitError(retriesAttempted);

      // Assert
      expect(error).toBeInstanceOf(McpError);
      expect(error.name).toBe('RateLimitError');
      expect(error.code).toBe(ErrorCodes.SERVER_ERROR);
      expect(error.message).toContain('rate limit exceeded');
      expect(error.message).toContain('3 retries');
    });

    it('should include retry count in message', () => {
      // Act
      const error = new RateLimitError(1);

      // Assert
      expect(error.message).toContain('1 retries');
    });
  });

  describe('NetworkError', () => {
    it('should create NetworkError with host and cause', () => {
      // Arrange
      const host = 'my-company.atlassian.net';
      const cause = 'ECONNREFUSED';

      // Act
      const error = new NetworkError(host, cause);

      // Assert
      expect(error).toBeInstanceOf(McpError);
      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe(ErrorCodes.SERVER_ERROR);
      expect(error.message).toContain(host);
      expect(error.message).toContain(cause);
    });

    it('should use default cause message when cause is undefined', () => {
      // Arrange
      const host = 'my-company.atlassian.net';

      // Act
      const error = new NetworkError(host);

      // Assert
      expect(error.message).toContain(host);
      expect(error.message).toContain('network connectivity');
    });
  });

  describe('TimeoutError', () => {
    it('should create TimeoutError with endpoint and timeout', () => {
      // Arrange
      const endpoint = '/rest/api/3/search';
      const timeoutMs = 30000;

      // Act
      const error = new TimeoutError(endpoint, timeoutMs);

      // Assert
      expect(error).toBeInstanceOf(McpError);
      expect(error.name).toBe('TimeoutError');
      expect(error.code).toBe(ErrorCodes.SERVER_ERROR);
      expect(error.message).toContain(endpoint);
      expect(error.message).toContain('30 seconds');
    });
  });

  describe('ValidationError', () => {
    it('should create ValidationError with validation errors array', () => {
      // Arrange
      const validationErrors = [{ path: 'summary', message: 'Summary is required', received: '' }];

      // Act
      const error = new ValidationError(validationErrors);

      // Assert
      expect(error).toBeInstanceOf(McpError);
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe(ErrorCodes.INVALID_PARAMS);
      expect(error.data).toEqual({ validationErrors });
    });
  });

  describe('mapHttpError', () => {
    it('should return JiraAuthError on 401', () => {
      // Act
      const error = mapHttpError(401, { errorMessages: ['Unauthorized'] }, '/rest/api/3/myself');

      // Assert
      expect(error).toBeInstanceOf(JiraAuthError);
    });

    it('should return access denied on 403', () => {
      // Act
      const error = mapHttpError(403, {}, '/rest/api/3/issue/PROJ-1');

      // Assert
      expect(error).toBeInstanceOf(McpError);
      expect(error.message).toContain('Access denied');
      expect(error.message).toContain('permission');
    });

    it('should return not found error on 404', () => {
      // Act
      const error = mapHttpError(
        404,
        { errorMessages: ['Issue not found'] },
        '/rest/api/3/issue/BAD-1',
      );

      // Assert
      expect(error).toBeInstanceOf(McpError);
      expect(error.message).toContain('not found');
      expect(error.message).toContain('/rest/api/3/issue/BAD-1');
    });

    it('should throw special object on 429 for retry handler', () => {
      // Act & Assert - mapHttpError does NOT return an error for 429, it throws
      expect(() => mapHttpError(429, {}, '/rest/api/3/search')).toThrow();
      try {
        mapHttpError(429, {}, '/rest/api/3/search');
      } catch (err) {
        expect(err).toEqual({ status: 429, retryAfter: 30000 });
      }
    });

    it('should return server error on 500', () => {
      // Act
      const error = mapHttpError(500, {}, '/rest/api/3/search');

      // Assert
      expect(error).toBeInstanceOf(McpError);
      expect(error.message).toContain('server error');
    });

    it('should return generic error with messages on 4xx', () => {
      // Act
      const error = mapHttpError(400, { errorMessages: ['Invalid JQL'] }, '/rest/api/3/search');

      // Assert
      expect(error).toBeInstanceOf(McpError);
      expect(error.message).toContain('400');
      expect(error.message).toContain('Invalid JQL');
    });
  });
});
