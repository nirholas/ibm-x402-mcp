#!/usr/bin/env node
// @three-ws/ibm-x402-mcp — stdio MCP server: IBM Granite AI tools gated by x402 USDC payments.
//
// The world's first x402-enabled MCP server on IBM Cloud.
// End users pay USDC on Solana per call — no IBM Cloud account needed.
// Server operators supply WATSONX_* credentials and MCP_SVM_PAYMENT_ADDRESS.
//
// Run standalone:
//   MCP_SVM_PAYMENT_ADDRESS=<your-solana-wallet> WATSONX_API_KEY=... WATSONX_PROJECT_ID=... node src/index.js
//
// Wire into Claude Desktop / Cursor / any MCP host:
//   npx @three-ws/ibm-x402-mcp
//
// Inspect tools:
//   npx -y @modelcontextprotocol/inspector npx @three-ws/ibm-x402-mcp

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { assertPaymentEnv, getResourceServer, getLastFacilitatorInitError } from './payments.js';
import { loadConfig, WatsonxClient } from './watsonx.js';
import { buildGraniteChatTool } from './tools/granite-chat.js';
import { buildGraniteCodeTool } from './tools/granite-code.js';
import { buildGraniteEmbedTool } from './tools/granite-embed.js';
import { buildGraniteAnalyzeTool } from './tools/granite-analyze.js';
import { buildGraniteForecastTool } from './tools/granite-forecast.js';
import { buildGettingStartedTool } from './tools/getting-started.js';

// Single source of truth for the version — read from package.json so the MCP
// server identity can never drift from the published package version.
const require = createRequire(import.meta.url);
const SERVER_VERSION = require('../package.json').version;

const SERVER_INSTRUCTIONS =
	'x402 pay-per-use IBM Granite AI tools from three.ws. Each tool lists its USDC price. ' +
	'New here? Call ibm_granite_getting_started (free, no payment) for an overview, prices, and the payment flow. ' +
	'Tool calls without an x402 payment payload in _meta return a PaymentRequired envelope ' +
	'(v2 MCP transport spec). ' +
	'Tools: ibm_granite_getting_started (FREE — overview & how to pay), ' +
	'ibm_granite_chat ($0.02 — conversational AI), ' +
	'ibm_granite_code ($0.025 — generate/review/refactor/explain/test/document code), ' +
	'ibm_granite_embed ($0.005 — batch embeddings for RAG/search), ' +
	'ibm_granite_analyze ($0.04 — structured document analysis), ' +
	'ibm_granite_forecast ($0.05 — zero-shot time-series forecasting). ' +
	'No IBM Cloud account required — pay USDC on Solana. Powered by IBM Granite foundation models.';

/**
 * Build and return a fully-registered McpServer without connecting any transport.
 * Safe to call from tests — no payment env or IBM credentials required at registration time.
 */
export async function buildServer(client) {
	const server = new McpServer(
		{ name: 'ibm-x402-mcp', version: SERVER_VERSION },
		{
			capabilities: { tools: { listChanged: false } },
			instructions: SERVER_INSTRUCTIONS,
		},
	);

	const tools = await Promise.all([
		buildGettingStartedTool(),
		buildGraniteChatTool(client),
		buildGraniteCodeTool(client),
		buildGraniteEmbedTool(client),
		buildGraniteAnalyzeTool(client),
		buildGraniteForecastTool(client),
	]);

	for (const t of tools) {
		server.registerTool(
			t.name,
			{
				title: t.title,
				description: t.description,
				inputSchema: t.inputSchema,
				annotations: t.annotations,
			},
			t.handler,
		);
	}

	return server;
}

async function main() {
	// Fail fast and clearly on any missing required env var: the payment address
	// first (a server that can't receive USDC is useless), then IBM credentials.
	// Each check throws an actionable single-line message naming the env var.
	let config;
	try {
		assertPaymentEnv();
		config = loadConfig();
	} catch (err) {
		console.error(`[ibm-x402-mcp] configuration error: ${err.message}`);
		process.exit(1);
		return;
	}

	const client = new WatsonxClient(config);

	// Warm the shared x402 resource server so the first paid call doesn't pay
	// the /supported fetch cost.
	await getResourceServer();
	const initErr = getLastFacilitatorInitError();
	if (initErr) {
		console.error(`[ibm-x402-mcp] facilitator init warning: ${initErr.message}`);
	}

	const server = await buildServer(client);
	const transport = new StdioServerTransport();
	await server.connect(transport);

	console.error(
		`[ibm-x402-mcp] ready — 1 free + 5 paid IBM Granite tools registered over stdio ` +
			`(model: ${config.chatModel} @ ${config.url})`,
	);
}

// Compare the entry path directly and via realpath: launched through the npm
// bin (a symlink to this file), process.argv[1] is the symlink while
// import.meta.url is the resolved target, so a direct compare alone would never
// start the server.
function isProcessEntryPoint() {
	const argvPath = process.argv[1];
	if (!argvPath) return false;
	if (import.meta.url === pathToFileURL(argvPath).href) return true;
	try {
		return import.meta.url === pathToFileURL(realpathSync(argvPath)).href;
	} catch {
		return false;
	}
}
const isEntryPoint = isProcessEntryPoint();

if (isEntryPoint) {
	main().catch((err) => {
		console.error(`ibm-x402-mcp: ${err?.message || err}`);
		process.exit(1);
	});
}
