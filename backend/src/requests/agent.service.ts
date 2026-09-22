import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RequestActor, RequestsService } from './requests.service';
import { INTAKE_PROVIDER, RequestyIntakeProvider } from './intake/intake.provider';

@Injectable()
export class AgentService {
  constructor(
    @Inject(INTAKE_PROVIDER) private readonly requestyProvider: RequestyIntakeProvider,
    private readonly requestsService: RequestsService,
  ) {}

  async respond(message: string, actor: RequestActor, contextRequestId?: string): Promise<unknown> {
    let completion;
    try {
      completion = await this.requestyProvider.completeWithTools(message, contextRequestId);
    } catch {
      throw new ServiceUnavailableException('The Requesty agent is unavailable');
    }

    if (!completion.toolCall) {
      const explicitLookup = this.extractNameDate(message);
      if (explicitLookup) return this.findByNameDate(explicitLookup.title, explicitLookup.date, actor);
      return { outcome: 'ANSWERED', message: completion.content ?? 'Please provide a request ID.' };
    }
    if (!['get_request_status', 'find_request_by_name_date'].includes(completion.toolCall.name)) return { outcome: 'UNSUPPORTED_TOOL', message: 'The requested tool is not available.' };

    let input: { requestId?: unknown; title?: unknown; date?: unknown };
    try {
      input = JSON.parse(completion.toolCall.arguments) as { requestId?: unknown };
    } catch {
      return { outcome: 'INVALID_TOOL_ARGUMENTS', message: 'The agent returned invalid tool arguments.' };
    }
    const requestId = typeof input.requestId === 'string' && input.requestId.trim() ? input.requestId : contextRequestId;
    let request;
    if (requestId) {
      request = await this.requestsService.findOne(requestId, actor);
    } else if (typeof input.title === 'string' && input.title.trim() && typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return this.findByNameDate(input.title, input.date, actor);
    } else {
      return { outcome: 'INVALID_TOOL_ARGUMENTS', message: 'Provide a request name and date, or select a request.' };
    }

    return {
      outcome: 'TOOL_EXECUTED',
      tool: 'get_request_status',
      result: { id: request.id, title: request.title, status: request.status, departmentId: request.departmentId, assignedTo: request.assignedTo },
    };
  }

  private async findByNameDate(title: string, date: string, actor: RequestActor): Promise<unknown> {
    const matches = await this.requestsService.findByTitleAndDate(title, date, actor);
    if (matches.length === 0) return { outcome: 'REQUEST_NOT_FOUND', message: 'No accessible request matched that name and date.' };
    if (matches.length > 1) return { outcome: 'AMBIGUOUS_REQUEST', message: `I found ${matches.length} requests with that name on that date. Please provide more detail.` };
    const request = matches[0];
    return {
      outcome: 'TOOL_EXECUTED',
      tool: 'find_request_by_name_date',
      result: { id: request.id, title: request.title, status: request.status, departmentId: request.departmentId, assignedTo: request.assignedTo },
    };
  }

  private extractNameDate(message: string): { title: string; date: string } | null {
    const quotedTitle = message.match(/["']([^"']+)["']/)?.[1]?.trim();
    const date = message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
    return quotedTitle && date ? { title: quotedTitle, date } : null;
  }
}