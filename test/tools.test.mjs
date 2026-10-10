// Smoke tests for the x402 tool surface. Tool building is secret-free by
// design (payment wiring is lazy, see src/payments.js), so the whole catalog
// can be enumerated with no MCP_SVM_PAYMENT_ADDRESS and no WATSONX_* env.
//
// Run: node --test packages/ibm-x402-mcp/test/tools.test.mjs

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

import { buildGettingStartedTool } from '../src/tools/getting-started.js';
import { buildGraniteChatTool } from '../src/tools/granite-chat.js';
import { buildGraniteCodeTool } from '../src/tools/granite-code.js';
import { buildGraniteEmbedTool } from '../src/tools/granite-embed.js';
import { buildGraniteAnalyzeTool } from '../src/tools/granite-analyze.js';
import { buildGraniteForecastTool } from '../src/tools/granite-forecast.js';

// Guarantee enumeration works with neither payment nor IBM credentials set.
delete process.env.MCP_SVM_PAYMENT_ADDRESS;
delete process.env.X402_PAY_TO_SOLANA;
delete process.env.X402_PAY_TO;
delete process.env.WATSONX_API_KEY;
delete process.env.WATSONX_PROJECT_ID;
delete process.env.WATSONX_SPACE_ID;

// Published per-call USDC prices. Kept in sync with README.md and CATALOG.md.
const PAID_PRICES = {
	ibm_granite_chat: '$0.02',
	ibm_granite_code: '$0.025',
	ibm_granite_embed: '$0.005',
	ibm_granite_analyze: '$0.04',
	ibm_granite_forecast: '$0.05',
};

let tools;

before(async () => {
	tools = await Promise.all([
		buildGettingStartedTool(),
		buildGraniteChatTool(null),
		buildGraniteCodeTool(null),
		buildGraniteEmbedTool(null),
		buildGraniteAnalyzeTool(null),
		buildGraniteForecastTool(null),
	]);
});

test('exposes one free tool plus the five documented paid tools', () => {
	const names = tools.map((t) => t.name).sort();
	assert.deepEqual(names, ['ibm_granite_getting_started', ...Object.keys(PAID_PRICES)].sort());
});

test('tool names are unique', () => {
	const names = tools.map((t) => t.name);
	assert.equal(new Set(names).size, names.length);
});

test('every tool has a non-empty description and human title', () => {
	for (const t of tools) {
		assert.ok(
			typeof t.description === 'string' && t.description.trim().length > 0,
			`${t.name} description`,
		);
		assert.ok(typeof t.title === 'string' && t.title.trim().length > 0, `${t.name} title`);
	}
});

test('every tool ships an input schema (zod raw shape) and a handler', () => {
	for (const t of tools) {
		assert.ok(t.inputSchema && typeof t.inputSchema === 'object', `${t.name} inputSchema`);
		assert.ok(Object.keys(t.inputSchema).length > 0, `${t.name} inputSchema has no fields`);
		assert.equal(typeof t.handler, 'function', `${t.name} handler`);
	}
});

test('every tool is annotated read-only (model inference modifies nothing)', () => {
	for (const t of tools) {
		assert.ok(t.annotations, `${t.name} annotations missing`);
		assert.equal(t.annotations.readOnlyHint, true, `${t.name} readOnlyHint`);
	}
});

test('paid tools are open-world; only embeddings are idempotent', () => {
	for (const t of tools) {
		if (t.name === 'ibm_granite_getting_started') continue;
		assert.equal(t.annotations.openWorldHint, true, `${t.name} openWorldHint`);
		const expectedIdempotent = t.name === 'ibm_granite_embed';
		assert.equal(t.annotations.idempotentHint, expectedIdempotent, `${t.name} idempotentHint`);
	}
});

test('getting_started is the static closed-world entry point and is free', () => {
	const t = tools.find((x) => x.name === 'ibm_granite_getting_started');
	assert.equal(t.annotations.openWorldHint, false);
	assert.equal(t.annotations.idempotentHint, true);
	assert.match(t.description, /FREE/i);
	assert.match(t.description, /no payment/i);
});

test('every paid tool description states its exact USDC price', () => {
	for (const [name, price] of Object.entries(PAID_PRICES)) {
		const t = tools.find((x) => x.name === name);
		assert.ok(t, `${name} not built`);
		assert.ok(t.description.includes(price), `${name} description must mention ${price}`);
		assert.ok(t.title.includes(price), `${name} title must mention ${price}`);
	}
});
