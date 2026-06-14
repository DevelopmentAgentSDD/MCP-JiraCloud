import { describe, it, expect } from 'vitest';
import { buildAuthHeader } from '../../../src/auth/index.js';

// ============================================================================
// T008 - Tests unitarios de autenticación
// ============================================================================

describe('Auth', () => {
  describe('buildAuthHeader', () => {
    it('should generate Basic Auth header from email and token', () => {
      // Arrange
      const email = 'user@example.com';
      const apiToken = 'test-token-12345';

      // Act
      const header = buildAuthHeader(email, apiToken);

      // Assert
      expect(header).toBeDefined();
      expect(header).toMatch(/^Basic\s.+/);
      // Decodificar para verificar credenciales
      const base64Part = header.split(' ')[1]!;
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      expect(decoded).toBe(`${email}:${apiToken}`);
    });

    it('should encode credentials in base64', () => {
      // Arrange
      const email = 'dev@company.com';
      const apiToken = 'secret-token-xyz';

      // Act
      const header = buildAuthHeader(email, apiToken);

      // Assert
      const base64Part = header.split(' ')[1]!;
      // Verificar que es base64 válido
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      expect(decoded).toContain(email);
      expect(decoded).toContain(apiToken);
      expect(decoded).toContain(':');
    });

    it('should return correct Authorization header format', () => {
      // Arrange
      const email = 'admin@atlassian.com';
      const apiToken = 'ATATT123456';

      // Act
      const header = buildAuthHeader(email, apiToken);

      // Assert
      expect(header.startsWith('Basic ')).toBe(true);
      // Formato: Basic base64(email:token)
      const parts = header.split(' ');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe('Basic');
      expect(parts[1]).toBeTruthy();
    });

    it('should handle special characters in email', () => {
      // Arrange
      const email = 'user+filter@company.com';
      const apiToken = 'token-with-dashes';

      // Act
      const header = buildAuthHeader(email, apiToken);

      // Assert
      const base64Part = header.split(' ')[1]!;
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      expect(decoded).toBe(`${email}:${apiToken}`);
    });

    it('should handle special characters in token', () => {
      // Arrange
      const email = 'user@example.com';
      const apiToken = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';

      // Act
      const header = buildAuthHeader(email, apiToken);

      // Assert
      const base64Part = header.split(' ')[1]!;
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      expect(decoded).toBe(`${email}:${apiToken}`);
    });
  });
});
