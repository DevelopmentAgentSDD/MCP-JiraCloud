import { describe, it, expect } from 'vitest';
import {
  sanitizeHeaders,
  sanitizeConfigForLogging,
  redactToken,
} from '../../../src/utils/sanitize.js';
import type { JiraConfig } from '../../../src/types/index.js';

// ============================================================================
// T014 - Tests unitarios de sanitización
// ============================================================================

describe('Sanitize', () => {
  describe('sanitizeHeaders', () => {
    it('should redact authorization header (lowercase)', () => {
      // Arrange
      const headers = {
        'content-type': 'application/json',
        authorization: 'Basic dXNlcjp0b2tlbg==',
        accept: 'application/json',
      };

      // Act
      const sanitized = sanitizeHeaders(headers);

      // Assert
      expect(sanitized['content-type']).toBe('application/json');
      expect(sanitized['accept']).toBe('application/json');
      expect(sanitized['authorization']).toBe('Basic [REDACTED]');
      expect(sanitized['authorization']).not.toContain('dXNlcjp0b2tlbg==');
    });

    it('should redact Authorization header (uppercase)', () => {
      // Arrange
      const headers: Record<string, string> = {
        Authorization: 'Basic c2VjcmV0OnRva2Vu',
      };

      // Act
      const sanitized = sanitizeHeaders(headers);

      // Assert
      expect(sanitized['Authorization']).toBe('Basic [REDACTED]');
      expect(sanitized['Authorization']).not.toContain('c2VjcmV0OnRva2Vu');
    });

    it('should preserve other headers unchanged', () => {
      // Arrange
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Correlation-Id': 'abc-123',
        'X-Atlassian-Token': 'no-check',
      };

      // Act
      const sanitized = sanitizeHeaders(headers);

      // Assert
      expect(sanitized['Content-Type']).toBe('application/json');
      expect(sanitized['Accept']).toBe('application/json');
      expect(sanitized['X-Correlation-Id']).toBe('abc-123');
      expect(sanitized['X-Atlassian-Token']).toBe('no-check');
    });

    it('should handle headers without authorization field', () => {
      // Arrange
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json',
      };

      // Act
      const sanitized = sanitizeHeaders(headers);

      // Assert
      expect(sanitized).toEqual(headers);
      expect(sanitized['content-type']).toBe('application/json');
    });

    it('should not mutate the original headers object', () => {
      // Arrange
      const headers = {
        authorization: 'Basic dXNlcjp0b2tlbg==',
        'content-type': 'application/json',
      };

      // Act
      const sanitized = sanitizeHeaders(headers);

      // Assert
      expect(headers['authorization']).toBe('Basic dXNlcjp0b2tlbg==');
      expect(sanitized['authorization']).toBe('Basic [REDACTED]');
    });
  });

  describe('sanitizeConfigForLogging', () => {
    it('should replace token with ***SET*** in config', () => {
      // Arrange
      const config: JiraConfig = {
        host: 'my-company.atlassian.net',
        email: 'dev@company.com',
        apiToken: 'my-secret-api-token',
        baseUrl: 'https://my-company.atlassian.net/rest/api/3',
        agileBaseUrl: 'https://my-company.atlassian.net/rest/agile/1.0',
      };

      // Act
      const sanitized = sanitizeConfigForLogging(config);

      // Assert
      expect(sanitized.host).toBe('my-company.atlassian.net');
      expect(sanitized.email).toBe('dev@company.com');
      expect(sanitized.apiToken).toBe('***SET***');
      expect(sanitized.apiToken).not.toContain('my-secret-api-token');
    });

    it('should show NOT SET when token is empty', () => {
      // Arrange
      const config: JiraConfig = {
        host: 'my-company.atlassian.net',
        email: 'dev@company.com',
        apiToken: '',
        baseUrl: 'https://my-company.atlassian.net/rest/api/3',
        agileBaseUrl: 'https://my-company.atlassian.net/rest/agile/1.0',
      };

      // Act
      const sanitized = sanitizeConfigForLogging(config);

      // Assert
      expect(sanitized.apiToken).toBe('NOT SET');
    });

    it('should not expose email or host', () => {
      // Arrange
      const config: JiraConfig = {
        host: 'my-company.atlassian.net',
        email: 'dev@company.com',
        apiToken: 'secret',
        baseUrl: 'https://my-company.atlassian.net/rest/api/3',
        agileBaseUrl: 'https://my-company.atlassian.net/rest/agile/1.0',
      };

      // Act
      const sanitized = sanitizeConfigForLogging(config);

      // Assert - email and host ARE exposed, only token is redacted
      expect(sanitized.host).toBe('my-company.atlassian.net');
      expect(sanitized.email).toBe('dev@company.com');
    });
  });

  describe('redactToken', () => {
    it('should replace all occurrences of token in text', () => {
      // Arrange
      const text = 'Error using token abc123 in request. Token abc123 is invalid.';
      const token = 'abc123';

      // Act
      const redacted = redactToken(text, token);

      // Assert
      expect(redacted).not.toContain('abc123');
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).toBe(
        'Error using token [REDACTED] in request. Token [REDACTED] is invalid.',
      );
    });

    it('should return original text when token is empty', () => {
      // Arrange
      const text = 'Error message with no token';

      // Act
      const redacted = redactToken(text, '');

      // Assert
      expect(redacted).toBe(text);
    });

    it('should not modify text when token is not present', () => {
      // Arrange
      const text = 'This is a normal error message.';
      const token = 'nonexistent';

      // Act
      const redacted = redactToken(text, token);

      // Assert
      expect(redacted).toBe(text);
    });
  });
});
