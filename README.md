# opencode-jira-mcp

MCP (Model Context Protocol) server that connects opencode with Jira Cloud, exposing issue tracking, project management, and agile features as structured tools for AI agents.

[![GitHub Packages](https://img.shields.io/badge/package-github%20packages-blue)](https://github.com/DevelopmentAgentSDD/MCP-JiraCloud/pkgs/npm/opencode-jira-mcp)
[![CI](https://github.com/DevelopmentAgentSDD/MCP-JiraCloud/actions/workflows/ci.yml/badge.svg)](https://github.com/DevelopmentAgentSDD/MCP-JiraCloud/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Requirements

- **Node.js >= 18**
- A **Jira Cloud** account with an API token
- An MCP client (such as [opencode](https://opencode.ai), Claude Desktop, or any MCP-compatible host)

## Installation

### 1. Authenticate with GitHub Packages

Create or edit your `~/.npmrc` file and add:

```ini
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
@DevelopmentAgentSDD:registry=https://npm.pkg.github.com
```

> **Get a GitHub token** at [Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens) with the `read:packages` scope.

### 2. Global install (recommended)

```bash
npm install -g @DevelopmentAgentSDD/opencode-jira-mcp
```

### 3. Using npx (no install)

```bash
npx @DevelopmentAgentSDD/opencode-jira-mcp
```

### From source

```bash
git clone https://github.com/DevelopmentAgentSDD/MCP-JiraCloud.git
cd MCP-JiraCloud
npm ci
npm run build
```

## Configuration

The server requires **three environment variables**:

| Variable | Description |
|---|---|
| `JIRA_HOST` | Your Jira Cloud domain (e.g., `my-company.atlassian.net`) — do **not** include `https://` |
| `JIRA_EMAIL` | Email address of your Atlassian account |
| `JIRA_API_TOKEN` | API token generated at [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |

### Configuring in opencode.json

Add the server to your `opencode.json` or MCP client configuration:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@DevelopmentAgentSDD/opencode-jira-mcp"],
      "env": {
        "JIRA_HOST": "my-company.atlassian.net",
        "JIRA_EMAIL": "me@my-company.com",
        "JIRA_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

## Available Tools

The server exposes **9 tools** to the MCP host:

### 1. `search_issues`

Search for issues in Jira using structured parameters or raw JQL.

```text
"Find all high-priority bugs in the PROJ project assigned to me"
"Search for issues containing 'login' in the summary or description"
```

**Parameters:** `projectKey`, `issueType`, `status`, `assignee`, `priority`, `labels`, `sprint`, `text`, `jql`, `startAt`, `maxResults`, `orderBy`, `fields`

### 2. `create_issue`

Create a new Jira issue of any type (Task, Bug, Story, Epic, Subtask).

```text
"Create a bug in PROJ: 'Login page crashes on mobile' with priority High"
"Create an Epic called 'Q2 Platform Migration' in the PROJ project"
```

**Parameters:** `projectKey`, `summary`, `issueType`, `description`, `priority`, `assignee`, `labels`, `parentKey` (Subtask), `epicName` (Epic)

### 3. `update_issue`

Modify fields on an existing Jira issue.

```text
"Update PROJ-123: change priority to Critical, add label 'security'"
"Set the assignee of PROJ-456 to unassigned"
```

**Parameters:** `issueKey`, `summary`, `description`, `priority`, `labels`, `assignee`, `components`, `customFields`

### 4. `transition_issue`

Move an issue through its workflow or list available transitions.

```text
"Move PROJ-123 to In Progress"
"What transitions are available for PROJ-456?"
"Close PROJ-789 with resolution 'Done'"
```

**Parameters:** `issueKey`, `transitionName`, `transitionId`, `resolution`, `comment`, `listTransitions`

### 5. `get_sprints`

Retrieve sprints from a Jira board with optional issue details.

```text
"Show me active sprints on the PROJ Scrum Board"
"List all sprints on board ID 42, including their issues"
```

**Parameters:** `boardId`, `boardName`, `state` (`active`|`future`|`closed`), `includeIssues`, `startAt`, `maxResults`

### 6. `assign_user`

Assign or unassign a user to/from an issue.

```text
"Assign PROJ-123 to John Doe"
"Unassign PROJ-456"
```

**Parameters:** `issueKey`, `accountId` (set to `null` or `"unassigned"` to unassign)

### 7. `manage_comments`

List or add comments on a Jira issue.

```text
"Show all comments on PROJ-123"
"Add a comment to PROJ-123: 'Fixed in PR #42, ready for review'"
```

**Parameters:** `action` (`list`|`add`), `issueKey`, `body` (for `add`), `startAt`, `maxResults`

### 8. `attach_file`

Attach a file from the local filesystem to a Jira issue.

```text
"Attach the file error-screenshot.png to PROJ-123"
```

**Parameters:** `issueKey`, `filePath` (must exist, be readable, and <10 MB)

### 9. `jira_health_check`

Verify connectivity to Jira Cloud and validate authentication credentials.

```text
"Check if the Jira connection is working"
```

**Parameters:** none

## Security

- **Token safety**: the `JIRA_API_TOKEN` is **never** written to stdout, stderr, or error messages. All log entries and error responses redact the token.
- **Headers sanitization**: `Authorization` headers are replaced with `Basic [REDACTED]` in all logs.
- **Config sanitization**: when logging the configuration, the token is displayed as `***SET***`.
- **Token rotation**: generate new tokens at [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens). The server picks up the new token on restart.

## Troubleshooting

### "JIRA_HOST is required"

Set the `JIRA_HOST` environment variable to your Jira Cloud domain without `https://`:

```bash
export JIRA_HOST=my-company.atlassian.net
```

### "JIRA_API_TOKEN is required"

Generate an API token at [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) and set it:

```bash
export JIRA_API_TOKEN=your-generated-token
```

### "Authentication failed"

- Verify your email matches the Atlassian account email
- Ensure the API token is active (not revoked)
- Check that `JIRA_HOST` is correct and does not include `https://`

### "Access denied"

Your account does not have permission for the requested action. Verify your project permissions in Jira.

### "Rate limit exceeded"

The server automatically retries with exponential backoff (up to 3 retries, max ~210s total). If you consistently hit rate limits, reduce request frequency or check your Jira Cloud plan limits.

## Development

```bash
# Install dependencies
npm ci

# Run in development mode (with auto-reload)
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build
```

### Project structure

```
src/
  index.ts                  # Entry point (shebang, main function)
  config/                   # Zod-based env var validation
  auth/                     # Basic Auth header builder
  services/                 # JiraClient (HTTP client with retry)
  tools/                    # 9 MCP tool handlers + centralized registration
  transport/                # Stdio transport setup
  types/                    # TypeScript interfaces
  utils/                    # Errors, retry logic, sanitization
tests/
  unit/                     # Unit tests (vitest)
  integration/              # Integration tests (nock for HTTP mocking)
  fixtures/                 # Mock Jira responses
```

### Tech stack

| Category | Technology |
|---|---|
| Language | TypeScript 5.5+ (strict mode) |
| Runtime | Node.js >= 18 |
| MCP SDK | @modelcontextprotocol/sdk ^1.0 |
| Validation | Zod ^3.24 |
| Logging | Pino ^9.0 |
| Testing | Vitest + nock |
| Linting | ESLint + Prettier |

## License

MIT — see [LICENSE](LICENSE) for details.
