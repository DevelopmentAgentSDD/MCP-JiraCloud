import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JiraClient } from '../../src/services/jira-client.js';
import type { JiraConfig } from '../../src/types/index.js';
import type { Logger } from 'pino';

// ============================================================================
// T044 - Integration tests against real Jira Cloud (conditional)
// ============================================================================

// Determine if we have the required environment variables
const HAS_JIRA_CREDENTIALS =
  !!process.env.JIRA_HOST && !!process.env.JIRA_EMAIL && !!process.env.JIRA_API_TOKEN;

const conditionalDescribe = HAS_JIRA_CREDENTIALS ? describe : describe.skip;

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

conditionalDescribe('Integration: Real Jira API', () => {
  let client: JiraClient;
  let config: JiraConfig;
  let createdIssueKey: string | null = null;

  beforeAll(() => {
    const host = process.env.JIRA_HOST!;
    config = {
      host,
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!,
      baseUrl: `https://${host}/rest/api/3`,
      agileBaseUrl: `https://${host}/rest/agile/1.0`,
    };

    client = new JiraClient(config, mockLogger, {
      baseTimeoutMs: 1000,
      requestTimeoutMs: 15000,
      maxRetries: 2,
    });
  });

  afterAll(async () => {
    // Cleanup: delete the test issue if we created one
    if (createdIssueKey) {
      try {
        await client.delete(`/rest/api/3/issue/${createdIssueKey}`);
      } catch {
        // Best effort cleanup
      }
    }
  });

  // ===========================================================================
  // Health check
  // ===========================================================================

  it('should connect to Jira and return user data (health check)', async () => {
    // Act
    const response = await client.get<{
      accountId: string;
      displayName: string;
      emailAddress: string;
    }>('/rest/api/3/myself');

    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('accountId');
    expect(response.data).toHaveProperty('displayName');
    expect(response.data).toHaveProperty('emailAddress');
    expect(response.data.emailAddress).toBe(config.email);
  });

  // ===========================================================================
  // Simple search
  // ===========================================================================

  it('should search issues with a simple JQL', async () => {
    // Act: search for recently created issues (last 1 day)
    const response = await client.get<{ total: number; issues: { key: string }[] }>(
      '/rest/api/3/search',
      {
        jql: 'created >= -1d',
        maxResults: 5,
        startAt: 0,
      },
    );

    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('total');
    expect(response.data).toHaveProperty('issues');
    expect(Array.isArray(response.data.issues)).toBe(true);
    expect(response.data.issues.length).toBeLessThanOrEqual(5);
  });

  // ===========================================================================
  // Create a test issue (requires a valid project key)
  // ===========================================================================

  const TEST_PROJECT_KEY = process.env.JIRA_TEST_PROJECT || 'PROJ';

  it('should create a test issue', async () => {
    // Arrange
    const issueBody = {
      fields: {
        project: { key: TEST_PROJECT_KEY },
        summary: 'Test issue from opencode-jira-mcp CI',
        issuetype: { name: 'Task' },
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'This issue was created by an automated integration test. It can be safely deleted.',
                },
              ],
            },
          ],
        },
      },
    };

    // Act
    const response = await client.post<{ id: string; key: string; self: string }>(
      '/rest/api/3/issue',
      issueBody,
    );

    // Assert
    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('key');
    expect(response.data.key).toMatch(/^[A-Z]+-\d+$/);
    createdIssueKey = response.data.key;

    // Verify we can read it back
    const readResponse = await client.get<{ key: string }>(`/rest/api/3/issue/${createdIssueKey}`);
    expect(readResponse.status).toBe(200);
    expect(readResponse.data.key).toBe(createdIssueKey);
  });

  // ===========================================================================
  // Update the test issue
  // ===========================================================================

  it('should update the test issue', async () => {
    // Only run if we successfully created an issue
    if (!createdIssueKey) {
      return;
    }

    // Arrange
    const updateBody = {
      fields: {
        summary: 'Test issue from opencode-jira-mcp CI (updated)',
      },
    };

    // Act
    const response = await client.put(`/rest/api/3/issue/${createdIssueKey}`, updateBody);

    // Assert
    expect(response.status).toBe(204);

    // Verify the update
    const readResponse = await client.get<{
      fields: { summary: string };
    }>(`/rest/api/3/issue/${createdIssueKey}`);
    expect(readResponse.data.fields.summary).toContain('(updated)');
  });

  // ===========================================================================
  // Get available transitions
  // ===========================================================================

  it('should list available transitions for the test issue', async () => {
    // Only run if we successfully created an issue
    if (!createdIssueKey) {
      return;
    }

    // Act
    const response = await client.get<{ transitions: { id: string; name: string }[] }>(
      `/rest/api/3/issue/${createdIssueKey}/transitions`,
    );

    // Assert
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('transitions');
    expect(Array.isArray(response.data.transitions)).toBe(true);
  });

  // ===========================================================================
  // Cleanup: delete test issue
  // ===========================================================================

  it('should delete the test issue', async () => {
    // Only run if we successfully created an issue
    if (!createdIssueKey) {
      return;
    }

    // Act
    const response = await client.delete(`/rest/api/3/issue/${createdIssueKey}`);

    // Assert
    expect(response.status).toBe(204);
    createdIssueKey = null;

    // Verify deletion
    try {
      await client.get(`/rest/api/3/issue/${createdIssueKey}`);
      expect('should have thrown 404').toBe('but did not');
    } catch (error: unknown) {
      expect(error).toBeDefined();
    }
  });
});
