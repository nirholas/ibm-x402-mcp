# Support

Support for **`@three-ws/ibm-x402-mcp`** — the x402 pay-per-use MCP server for IBM Granite — is provided by **three.ws**. This document is the single source of truth for how to get help, where to report problems, and what to expect back.

## Where to get help

| Channel | Use it for | Link |
|---|---|---|
| **GitHub Issues** | Bugs, crashes, unexpected tool output, feature requests | https://github.com/nirholas/three.ws/issues/new |
| **GitHub Discussions** | Setup questions, integration help, "how do I…" | https://github.com/nirholas/three.ws/discussions |
| **Email** | Private or account-specific support | support@three.ws |
| **Security** | Vulnerabilities — please do **not** open a public issue | security@three.ws |
| **Support page** | All channels in one place | https://three.ws/support |

For anything that exposes a key, wallet, or transaction signature, use email rather than a public issue.

## Before you open an issue

A few minutes here usually gets you an answer in one round-trip instead of three:

1. **Check the [README](./README.md)** — most "it won't start" reports are a missing required env var (`MCP_SVM_PAYMENT_ADDRESS`, `WATSONX_API_KEY`, and `WATSONX_PROJECT_ID` or `WATSONX_SPACE_ID`).
2. **Reproduce with the MCP inspector** so you can see the raw tool I/O:
   ```bash
   npm run inspect
   # or, without cloning:
   npx -y @modelcontextprotocol/inspector npx -y @three-ws/ibm-x402-mcp
   ```
3. **Confirm your IBM credentials work** independently — create/verify an API key at https://cloud.ibm.com/iam/apikeys and confirm the project id under *watsonx.ai project → Manage → General → Project ID*.

## What to include in a bug report

- The **tool** you called (`ibm_granite_chat`, `ibm_granite_code`, `ibm_granite_embed`, `ibm_granite_analyze`, or `ibm_granite_forecast`).
- The **package version** (`npx @three-ws/ibm-x402-mcp --version` or your `package.json` pin) and **Node version** (`node -v` — this server requires Node ≥ 20).
- Your **MCP client** (Claude Desktop, Claude Code, Cursor, a custom agent) and OS.
- The **`WATSONX_URL` region** you're pointed at (defaults to `us-south`).
- The **full error text** and, where possible, the inspector's raw request/response.
- **Redact secrets.** Never paste an API key, a private key, or a full wallet seed. A truncated public Solana address is fine.

## Payment & x402 questions

This server settles each call in **USDC on Solana** via the [x402 protocol](https://x402.org) through the [PayAI facilitator](https://facilitator.payai.network). Payment issues split into two layers:

- **Wallet / settlement** (you got charged but no result, or a `402` loop): include the Solana transaction signature (public) and the tool name. Email these to support@three.ws rather than posting publicly.
- **IBM inference** (the payment cleared but watsonx.ai errored): this is usually a credential, region, or model-id problem — see the README configuration table.

End users calling the tools never need an IBM Cloud account; only the **server operator** supplies `WATSONX_*` credentials and a receiving Solana wallet.

## Scope of support

- ✅ Installing, configuring, and running this MCP server.
- ✅ The five `ibm_granite_*` tools and their x402 payment flow.
- ✅ Integration with MCP clients (Claude Desktop/Code, Cursor, custom agents).
- ❌ IBM watsonx.ai platform issues, Granite model behavior, or IBM billing — those go to [IBM Cloud Support](https://cloud.ibm.com/unifieddeliveryportal). We'll help you tell the two apart.

## Response expectations

This is a community-supported open-source project maintained by three.ws. We triage GitHub issues and support email on a best-effort basis, typically within a few business days. Security reports sent to security@three.ws are prioritized.

## Languages

Support is provided in **English**.

---

Built by [three.ws](https://three.ws) · Apache-2.0. This is an independent project that integrates IBM Granite via watsonx.ai; it is not an IBM product and is not supported by IBM. *Granite*, *watsonx*, and *watsonx.ai* are trademarks of IBM.
