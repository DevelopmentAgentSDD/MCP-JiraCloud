#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import { loadConfig, sanitizeConfig } from './config/index.js';
import { JiraClient } from './services/jira-client.js';
import { connectStdioTransport } from './transport/stdio-server.js';
import { registerAllTools } from './tools/register.js';

/**
 * Entry point principal del MCP Server.
 *
 * Ciclo de vida:
 * 1. Carga y valida configuracion (JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN)
 * 2. Crea logger pino (stderr)
 * 3. Crea JiraClient con config + logger
 * 4. Crea McpServer con serverInfo
 * 5. Registra las 9 tools via registerAllTools()
 * 6. Conecta transporte stdio
 * 7. Queda esperando requests JSON-RPC en stdin
 */
async function main(): Promise<void> {
  // 1. Logger a stderr (niveles: error, warn, info, debug)
  const logger = pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      ...(process.env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      }),
    },
    pino.destination(2), // stderr
  );

  try {
    // 2. Cargar y validar configuracion
    const config = loadConfig();
    logger.info({ config: sanitizeConfig(config) }, 'Configuration loaded');

    // 3. Crear JiraClient
    const jiraClient = new JiraClient(config, logger);

    // 4. Crear McpServer
    const server = new McpServer({
      name: 'opencode-jira-mcp',
      version: '1.0.0',
    });

    // 5. Registrar todas las tools
    registerAllTools(server, jiraClient, config);

    // 6. Conectar transporte stdio
    await connectStdioTransport(server, logger);

    logger.info('opencode-jira-mcp started successfully');

    // 7. Manejar señales de terminacion
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down MCP Server');
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.fatal({ err: error }, `Failed to start MCP Server: ${message}`);
    process.exit(1);
  }
}

main();
