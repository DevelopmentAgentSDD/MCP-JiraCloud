import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '../services/jira-client.js';
import type { JiraConfig } from '../types/index.js';

import { registerSearchIssues } from './search-issues.js';
import { registerCreateIssue } from './create-issue.js';
import { registerUpdateIssue } from './update-issue.js';
import { registerTransitionIssue } from './transition-issue.js';
import { registerGetSprints } from './get-sprints.js';
import { registerAssignUser } from './assign-user.js';
import { registerManageComments } from './manage-comments.js';
import { registerAttachFile } from './attach-file.js';
import { registerHealthCheck } from './health-check.js';

/**
 * Registra todas las tools MCP en el servidor.
 * Cada tool es autocontenida y no depende de otras tools.
 */
export function registerAllTools(
  server: McpServer,
  jiraClient: JiraClient,
  config: JiraConfig,
): void {
  registerSearchIssues(server, jiraClient);
  registerCreateIssue(server, jiraClient);
  registerUpdateIssue(server, jiraClient);
  registerTransitionIssue(server, jiraClient);
  registerGetSprints(server, jiraClient);
  registerAssignUser(server, jiraClient);
  registerManageComments(server, jiraClient);
  registerAttachFile(server, jiraClient);
  registerHealthCheck(server, jiraClient, config);
}
