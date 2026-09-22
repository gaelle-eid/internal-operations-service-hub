import { AgentService } from './agent.service';
import { RequestStatus } from './enums/request-status.enum';

describe('Requesty agent tools', () => {
  it('executes get_request_status through the backend service', async () => {
    const provider = {
      completeWithTools: async () => ({
        content: null,
        toolCall: { name: 'get_request_status', arguments: JSON.stringify({ requestId: 'request-1' }) },
      }),
    };
    const requestsService = {
      findOne: async () => ({ id: 'request-1', title: 'Laptop issue', status: RequestStatus.SUBMITTED, departmentId: 'IT', assignedTo: null }),
    };
    const service = new AgentService(provider as never, requestsService as never);

    await expect(service.respond('What is the status of request-1?', { id: 'employee-1', role: 'employee' })).resolves.toMatchObject({
      outcome: 'TOOL_EXECUTED',
      tool: 'get_request_status',
      result: { id: 'request-1', status: RequestStatus.SUBMITTED },
    });
    expect(requestsService.findOne).toBeDefined();
  });

  it('rejects malformed tool arguments without calling persistence', async () => {
    const provider = {
      completeWithTools: async () => ({ content: null, toolCall: { name: 'get_request_status', arguments: '{bad json' } }),
    };
    const findOne = async () => { throw new Error('must not be called'); };
    const service = new AgentService(provider as never, { findOne } as never);

    await expect(service.respond('check it', { id: 'employee-1', role: 'employee' })).resolves.toMatchObject({
      outcome: 'INVALID_TOOL_ARGUMENTS',
    });
  });

  it('uses selected request context when the assistant omits the long ID', async () => {
    const provider = {
      completeWithTools: async () => ({ content: null, toolCall: { name: 'get_request_status', arguments: '{}' } }),
    };
    const findOne = async (requestId: string) => ({ id: requestId, title: 'VPN issue', status: RequestStatus.IN_PROGRESS, departmentId: 'IT', assignedTo: 'it-1' });
    const service = new AgentService(provider as never, { findOne } as never);

    await expect(service.respond('What is the status of this request?', { id: 'employee-1', role: 'employee' }, 'request-2')).resolves.toMatchObject({
      outcome: 'TOOL_EXECUTED',
      result: { id: 'request-2', status: RequestStatus.IN_PROGRESS },
    });
  });

  it('finds an accessible request by name and date', async () => {
    const provider = {
      completeWithTools: async () => ({
        content: null,
        toolCall: { name: 'get_request_status', arguments: JSON.stringify({ title: 'Payroll issue', date: '2026-09-22' }) },
      }),
    };
    const requestsService = {
      findByTitleAndDate: async () => [{ id: 'request-3', title: 'Payroll issue', status: RequestStatus.ASSIGNED, departmentId: 'HR', assignedTo: 'hr-1' }],
    };
    const service = new AgentService(provider as never, requestsService as never);

    await expect(service.respond('What is the request Payroll issue from September 22?', { id: 'employee-1', role: 'employee' })).resolves.toMatchObject({
      outcome: 'TOOL_EXECUTED',
      result: { id: 'request-3', status: RequestStatus.ASSIGNED },
    });
  });

  it('recovers an explicit quoted name and date when Requesty answers without a tool call', async () => {
    const provider = { completeWithTools: async () => ({ content: 'I can look that up.', toolCall: null }) };
    const requestsService = {
      findByTitleAndDate: async () => [{ id: 'request-4', title: 'Laptop issue', status: RequestStatus.SUBMITTED, departmentId: 'IT', assignedTo: null }],
    };
    const service = new AgentService(provider as never, requestsService as never);

    await expect(service.respond('What is the status of "Laptop issue" from 2026-09-22?', { id: 'employee-1', role: 'employee' })).resolves.toMatchObject({
      outcome: 'TOOL_EXECUTED',
      tool: 'find_request_by_name_date',
      result: { id: 'request-4' },
    });
  });
});