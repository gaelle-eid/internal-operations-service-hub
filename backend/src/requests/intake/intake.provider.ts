import { Injectable } from '@nestjs/common';

export type IntakeCandidate = {
  title: unknown;
  description: unknown;
  category: unknown;
  priority: unknown;
  departmentId: unknown;
};

export const INTAKE_PROVIDER = 'INTAKE_PROVIDER';

export interface IntakeProvider {
  complete(text: string): Promise<unknown>;
}

export type AgentToolCall = { name: string; arguments: string };
export type AgentCompletion = { content: string | null; toolCall: AgentToolCall | null };

@Injectable()
export class RequestyIntakeProvider implements IntakeProvider {
  private readonly endpoint = process.env.REQUESTY_BASE_URL || 'https://router.requesty.ai/v1/chat/completions';
  private readonly model = process.env.REQUESTY_MODEL || 'google/gemma-4-31b-it';

  async complete(text: string): Promise<unknown> {
    const response = await this.request({
        model: this.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: [
              'You classify internal service requests for an advisory intake flow.',
              'Return JSON only, with exactly these string fields: title, description, category, priority, departmentId.',
              'Allowed departmentId values: IT, HR, Finance. Allowed category values: Hardware, Access, People, Finance, Other.',
              'Allowed priority values: Low, Medium, High. Use null for departmentId when the department is unclear.',
              'Never invent a department when the text is ambiguous.',
            ].join(' '),
          },
          { role: 'user', content: text },
        ],
    });
    const payload = response as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Requesty response did not contain message content');
    }

    return this.parseJson(content);
  }

  async completeWithTools(text: string, contextRequestId?: string): Promise<AgentCompletion> {
    const response = await this.request({
      model: this.model,
      temperature: 0,
      messages: [
        { role: 'system', content: `You are a service hub assistant. Use get_request_status for a selected/current request or UUID. Use find_request_by_name_date when the user identifies a request by its name/title and date. Never claim to have changed data.${contextRequestId ? ` The current selected request ID is ${contextRequestId}; use get_request_status for phrases such as "this request".` : ''}` },
        { role: 'user', content: text },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'get_request_status',
          description: 'Read the current status and ownership details for one service request. Identify it by requestId, or by title and date when the user gives a request name and date.',
          parameters: {
            type: 'object',
            properties: {
              requestId: { type: 'string', description: 'The request id to inspect, when available' },
              title: { type: 'string', description: 'The request title or name' },
              date: { type: 'string', description: 'Creation date in YYYY-MM-DD format' },
            },
            additionalProperties: false,
          },
        },
      }, {
        type: 'function',
        function: {
          name: 'find_request_by_name_date',
          description: 'Find a request by its title/name and creation date, then read its current status. Use this when the user gives a request name and date instead of an ID.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'The request title or name' },
              date: { type: 'string', description: 'Creation date in YYYY-MM-DD format' },
            },
            required: ['title', 'date'],
            additionalProperties: false,
          },
        },
      }],
    });
    const message = (response as { choices?: Array<{ message?: { content?: unknown; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }> }).choices?.[0]?.message;
    const toolCall = message?.tool_calls?.[0]?.function;
    return {
      content: typeof message?.content === 'string' ? message.content : null,
      toolCall: toolCall?.name && toolCall.arguments ? { name: toolCall.name, arguments: toolCall.arguments } : null,
    };
  }

  private async request(body: unknown): Promise<unknown> {
    const apiKey = process.env.REQUESTY_API_KEY;
    if (!apiKey) throw new Error('REQUESTY_API_KEY is not configured');
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Requesty returned HTTP ${response.status}`);
    return response.json();
  }

  private parseJson(content: string): unknown {
    const withoutFence = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(withoutFence);
  }
}