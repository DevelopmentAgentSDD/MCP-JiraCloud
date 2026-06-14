import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, sanitizeConfig } from '../../../src/config/index.js';
import type { JiraConfig } from '../../../src/types/index.js';

// ============================================================================
// T006 - Tests unitarios de configuración
// ============================================================================

describe('Config', () => {
  const validEnv = {
    JIRA_HOST: 'my-company.atlassian.net',
    JIRA_EMAIL: 'user@example.com',
    JIRA_API_TOKEN: 'test-token-12345',
  };

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Guardar el entorno original antes de cada test
    originalEnv = { ...process.env };
    // Limpiar las variables que vamos a testear
    delete process.env.JIRA_HOST;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;
  });

  afterEach(() => {
    // Restaurar el entorno original después de cada test
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load config when env vars are valid', () => {
      // Arrange
      process.env = { ...validEnv };

      // Act
      const config = loadConfig();

      // Assert
      expect(config).toBeDefined();
      expect(config.host).toBe('my-company.atlassian.net');
      expect(config.email).toBe('user@example.com');
      expect(config.apiToken).toBe('test-token-12345');
      expect(config.baseUrl).toBe('https://my-company.atlassian.net/rest/api/3');
      expect(config.agileBaseUrl).toBe('https://my-company.atlassian.net/rest/agile/1.0');
    });

    it('should throw when JIRA_HOST is missing', () => {
      // Arrange
      process.env = { JIRA_EMAIL: validEnv.JIRA_EMAIL, JIRA_API_TOKEN: validEnv.JIRA_API_TOKEN };

      // Act & Assert
      expect(() => loadConfig()).toThrow('Configuration error');
      expect(() => loadConfig()).toThrow('JIRA_HOST');
    });

    it('should throw when JIRA_EMAIL is missing', () => {
      // Arrange
      process.env = { JIRA_HOST: validEnv.JIRA_HOST, JIRA_API_TOKEN: validEnv.JIRA_API_TOKEN };

      // Act & Assert
      expect(() => loadConfig()).toThrow('Configuration error');
      expect(() => loadConfig()).toThrow('JIRA_EMAIL');
    });

    it('should throw when JIRA_API_TOKEN is missing', () => {
      // Arrange
      process.env = { JIRA_HOST: validEnv.JIRA_HOST, JIRA_EMAIL: validEnv.JIRA_EMAIL };

      // Act & Assert
      expect(() => loadConfig()).toThrow('Configuration error');
      expect(() => loadConfig()).toThrow('JIRA_API_TOKEN');
    });

    it('should throw when JIRA_HOST includes protocol', () => {
      // Arrange
      process.env = { ...validEnv, JIRA_HOST: 'https://my-company.atlassian.net' };

      // Act & Assert
      expect(() => loadConfig()).toThrow('Configuration error');
      expect(() => loadConfig()).toThrow('protocol');
    });

    it('should throw when JIRA_EMAIL is not a valid email', () => {
      // Arrange
      process.env = { ...validEnv, JIRA_EMAIL: 'not-an-email' };

      // Act & Assert
      expect(() => loadConfig()).toThrow('Configuration error');
      expect(() => loadConfig()).toThrow('valid email');
    });
  });

  describe('sanitizeConfig', () => {
    it('should sanitize config to hide token in logs', () => {
      // Arrange
      const config: JiraConfig = {
        host: 'my-company.atlassian.net',
        email: 'user@example.com',
        apiToken: 'secret-token-abc',
        baseUrl: 'https://my-company.atlassian.net/rest/api/3',
        agileBaseUrl: 'https://my-company.atlassian.net/rest/agile/1.0',
      };

      // Act
      const sanitized = sanitizeConfig(config);

      // Assert
      expect(sanitized.host).toBe('my-company.atlassian.net');
      expect(sanitized.email).toBe('user@example.com');
      expect(sanitized.apiToken).toBe('***SET***');
      expect(sanitized.apiToken).not.toBe('secret-token-abc');
    });

    it('should show NOT SET when token is empty', () => {
      // Arrange
      const config: JiraConfig = {
        host: 'my-company.atlassian.net',
        email: 'user@example.com',
        apiToken: '',
        baseUrl: 'https://my-company.atlassian.net/rest/api/3',
        agileBaseUrl: 'https://my-company.atlassian.net/rest/agile/1.0',
      };

      // Act
      const sanitized = sanitizeConfig(config);

      // Assert
      expect(sanitized.apiToken).toBe('NOT SET');
    });
  });
});
