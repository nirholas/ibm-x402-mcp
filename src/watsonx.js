// IBM watsonx.ai REST client (server-side credentials).
//
// In ibm-x402-mcp the server operator supplies WATSONX_* env vars; end users
// pay USDC and receive results without needing their own IBM Cloud account.
// The client is a thin, dependency-free wrapper over the watsonx.ai REST API:
// IAM token minting from an API key, in-process caching with proactive refresh,
// and typed methods for every inference surface we expose as paid tools.

const IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';
const TOKEN_SKEW_MS = 5 * 60 * 1000;

export class WatsonxError extends Error {
	constructor(message, { status, detail } = {}) {
		super(message);
		this.name = 'WatsonxError';
		this.status = status;
		this.detail = detail;
	}
}

export function loadConfig(env = process.env) {
	const apiKey = env.WATSONX_API_KEY?.trim();
	if (!apiKey) {
		throw new WatsonxError(
			'WATSONX_API_KEY is not set. IBM Cloud API key required — create one at https://cloud.ibm.com/iam/apikeys.',
		);
	}
	const projectId = env.WATSONX_PROJECT_ID?.trim();
	const spaceId = env.WATSONX_SPACE_ID?.trim();
	if (!projectId && !spaceId) {
		throw new WatsonxError(
			'Set WATSONX_PROJECT_ID (or WATSONX_SPACE_ID). Find it under watsonx.ai project → Manage → General → Project ID.',
		);
	}
	return {
		apiKey,
		projectId,
		spaceId,
		url: (env.WATSONX_URL?.trim() || 'https://us-south.ml.cloud.ibm.com').replace(/\/$/, ''),
		iamUrl: env.WATSONX_IAM_URL?.trim() || IAM_TOKEN_URL,
		apiVersion: env.WATSONX_API_VERSION?.trim() || '2024-05-31',
		tsApiVersion: env.WATSONX_TS_API_VERSION?.trim() || '2025-02-11',
		chatModel: env.WATSONX_MODEL_ID?.trim() || 'ibm/granite-3-8b-instruct',
		codeModel: env.WATSONX_CODE_MODEL_ID?.trim() || 'ibm/granite-3-8b-instruct',
		embedModel: env.WATSONX_EMBED_MODEL_ID?.trim() || 'ibm/granite-embedding-278m-multilingual',
		forecastModel: env.WATSONX_FORECAST_MODEL?.trim() || 'ibm/granite-ttm-512-96-r2',
		timeoutMs: Number(env.WATSONX_TIMEOUT_MS) || 90_000,
	};
}

export class WatsonxClient {
	constructor(config) {
		this.config = config;
		this._token = null;
		this._tokenPromise = null;
	}

	_scope() {
		return this.config.projectId
			? { project_id: this.config.projectId }
			: { space_id: this.config.spaceId };
	}

	async _getToken() {
		const now = Date.now();
		if (this._token && this._token.expiresAt - TOKEN_SKEW_MS > now) {
			return this._token.token;
		}
		if (this._tokenPromise) return this._tokenPromise;

		this._tokenPromise = (async () => {
			const body = new URLSearchParams({
				grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
				apikey: this.config.apiKey,
			});
			const res = await this._fetch(this.config.iamUrl, {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					accept: 'application/json',
				},
				body,
			});
			const data = await this._json(res);
			if (!res.ok || !data.access_token) {
				throw new WatsonxError('IAM authentication failed — check WATSONX_API_KEY.', {
					status: res.status,
					detail: data.errorMessage || data.errorCode || data,
				});
			}
			const expiresAt = now + (Number(data.expires_in) || 3600) * 1000;
			this._token = { token: data.access_token, expiresAt };
			return this._token.token;
		})();

		try {
			return await this._tokenPromise;
		} finally {
			this._tokenPromise = null;
		}
	}

	async _fetch(url, init) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
		try {
			return await fetch(url, { ...init, signal: controller.signal });
		} catch (err) {
			if (err.name === 'AbortError') {
				throw new WatsonxError(`Request to ${url} timed out after ${this.config.timeoutMs}ms.`);
			}
			throw new WatsonxError(`Network error calling ${url}: ${err.message}`);
		} finally {
			clearTimeout(timer);
		}
	}

	async _json(res) {
		const text = await res.text();
		if (!text) return {};
		try {
			return JSON.parse(text);
		} catch {
			return { _raw: text };
		}
	}

	async _post(path, payload, version) {
		const token = await this._getToken();
		const url = `${this.config.url}${path}?version=${version || this.config.apiVersion}`;
		const res = await this._fetch(url, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${token}`,
				'content-type': 'application/json',
				accept: 'application/json',
			},
			body: JSON.stringify({ ...payload, ...this._scope() }),
		});
		const data = await this._json(res);
		if (!res.ok) throw this._upstreamError(res.status, data);
		return data;
	}

	async _get(path, params = {}) {
		const token = await this._getToken();
		const query = new URLSearchParams({ version: this.config.apiVersion, ...params });
		const res = await this._fetch(`${this.config.url}${path}?${query}`, {
			method: 'GET',
			headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
		});
		const data = await this._json(res);
		if (!res.ok) throw this._upstreamError(res.status, data);
		return data;
	}

	_upstreamError(status, data) {
		const first = Array.isArray(data?.errors) ? data.errors[0] : null;
		const message =
			first?.message || data?.message || data?._raw || 'watsonx.ai request failed';
		return new WatsonxError(`watsonx.ai error (${status}): ${message}`, {
			status,
			detail: first?.code || data?.trace || undefined,
		});
	}

	async chat(messages, { model, parameters } = {}) {
		const data = await this._post('/ml/v1/text/chat', {
			model_id: model || this.config.chatModel,
			messages,
			...(parameters ? { parameters } : {}),
		});
		const choice = data.choices?.[0];
		return {
			text: choice?.message?.content ?? '',
			finishReason: choice?.finish_reason,
			usage: data.usage,
			model: data.model_id || model || this.config.chatModel,
		};
	}

	async generate(input, { model, parameters } = {}) {
		const data = await this._post('/ml/v1/text/generation', {
			model_id: model || this.config.codeModel,
			input,
			...(parameters ? { parameters } : {}),
		});
		const result = data.results?.[0];
		return {
			text: result?.generated_text ?? '',
			generatedTokenCount: result?.generated_token_count,
			inputTokenCount: result?.input_token_count,
			stopReason: result?.stop_reason,
			model: model || this.config.codeModel,
		};
	}

	async embed(inputs, { model } = {}) {
		const data = await this._post('/ml/v1/text/embeddings', {
			model_id: model || this.config.embedModel,
			inputs,
		});
		return {
			model: model || this.config.embedModel,
			vectors: (data.results || []).map((r) => r.embedding),
			inputCount: inputs.length,
			dimensions: data.results?.[0]?.embedding?.length ?? 0,
		};
	}

	async forecast({ timestamps, values, freq, model, targetColumn = 'value', predictionLength } = {}) {
		if (
			!Array.isArray(timestamps) ||
			!Array.isArray(values) ||
			timestamps.length !== values.length ||
			values.length === 0
		) {
			throw new WatsonxError(
				'forecast: timestamps and values must be equal-length, non-empty arrays.',
			);
		}
		const data = await this._post(
			'/ml/v1/time_series/forecast',
			{
				model_id: model || this.config.forecastModel,
				schema: { timestamp_column: 'date', freq, target_columns: [targetColumn] },
				data: { date: timestamps, [targetColumn]: values },
				...(predictionLength ? { parameters: { prediction_length: predictionLength } } : {}),
			},
			this.config.tsApiVersion,
		);
		const r = data.results?.[0] || {};
		return {
			model: data.model_id || model || this.config.forecastModel,
			timestamps: r.date || [],
			values: r[targetColumn] || [],
			inputWindow: values.length,
		};
	}

	async tokenize(input, { model, returnTokens = false } = {}) {
		const data = await this._post('/ml/v1/text/tokenization', {
			model_id: model || this.config.chatModel,
			input,
			parameters: { return_tokens: returnTokens },
		});
		return {
			model: model || this.config.chatModel,
			tokenCount: data.result?.token_count ?? 0,
		};
	}

	async listModels({ filter, limit = 100 } = {}) {
		const params = { limit: String(Math.min(limit, 200)) };
		if (filter) params.filters = filter;
		const data = await this._get('/ml/v1/foundation_model_specs', params);
		return (data.resources || []).map((m) => ({
			model_id: m.model_id,
			label: m.label,
			provider: m.provider,
			functions: (m.functions || []).map((f) => f.id),
			short_description: m.short_description,
		}));
	}
}
