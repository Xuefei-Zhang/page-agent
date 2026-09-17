import { describe, expect, it } from 'vitest'

import { modelPatch, normalizeModelName } from './utils'

describe('normalizeModelName', () => {
	it.each([
		['gpt-5.2', 'gpt-52'],
		['gpt_5_2', 'gpt52'],
		['GPT-52-2026-01-01', 'gpt-52-2026-01-01'],
		['openai/gpt-5.2-chat', 'gpt-52-chat'],
		['claude_sonnet4_5', 'claudesonnet45'],
	])('%s -> %s', (input, expected) => {
		expect(normalizeModelName(input)).toBe(expected)
	})
})

describe('modelPatch', () => {
	it('qwen on DashScope: top-level enable_thinking flag, tool_choice kept', () => {
		const body: Record<string, any> = { model: 'qwen3.5-plus', tool_choice: 'required' }
		modelPatch(body, 'https://dashscope.aliyuncs.com/compatible-mode/v1')
		expect(body.enable_thinking).toBe(false)
		expect(body.chat_template_kwargs).toBeUndefined()
		expect(body.tool_choice).toBe('required')
	})

	it('qwen on self-hosted (vLLM): chat_template_kwargs + no explicit tool_choice', () => {
		const body: Record<string, any> = { model: 'Qwen3.6-27B-FP8', tool_choice: 'required' }
		modelPatch(body, 'http://100.64.62.82:9070/v1')
		expect(body.enable_thinking).toBeUndefined()
		expect(body.chat_template_kwargs).toEqual({ enable_thinking: false })
		expect(body.tool_choice).toBeUndefined()
	})

	it('qwen on self-hosted: preserves user-provided chat_template_kwargs', () => {
		const body: Record<string, any> = {
			model: 'Qwen3.6-27B-FP8',
			chat_template_kwargs: { custom: 1 },
		}
		modelPatch(body, 'http://localhost:8000/v1')
		expect(body.chat_template_kwargs).toEqual({ custom: 1, enable_thinking: false })
	})

	it('qwen with no baseURL: treated as self-hosted', () => {
		const body: Record<string, any> = { model: 'qwen3.5-plus', tool_choice: 'required' }
		modelPatch(body)
		expect(body.chat_template_kwargs).toEqual({ enable_thinking: false })
		expect(body.tool_choice).toBeUndefined()
	})

	it('qwen3.8-max on OpenRouter: reasoning_effort=low, tool_choice removed', () => {
		const body: Record<string, any> = { model: 'qwen38-max', tool_choice: 'required' }
		modelPatch(body, 'https://openrouter.ai/api/v1')
		expect(body.reasoning_effort).toBe('low')
		expect(body.tool_choice).toBeUndefined()
	})
})
