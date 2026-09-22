import { ServiceUnavailableException } from '@nestjs/common';
import { IntakeProvider } from './intake/intake.provider';
import { IntakeService } from './intake/intake.service';

const candidate = {
  title: 'Laptop will not boot',
  description: 'My laptop will not boot and I cannot work.',
  category: 'Hardware',
  priority: 'High',
  departmentId: 'IT',
};

function serviceReturning(result: unknown): IntakeService {
  const provider: IntakeProvider = { complete: async () => result };
  return new IntakeService(provider);
}

describe('AI-assisted request intake evaluations', () => {
  it('accepts a clear candidate inside product bounds', async () => {
    await expect(serviceReturning(candidate).classify('laptop issue')).resolves.toMatchObject({
      outcome: 'READY',
      candidate,
    });
  });

  it('asks for clarification when a thin result has no department', async () => {
    await expect(serviceReturning({ ...candidate, departmentId: null }).classify('I need help')).resolves.toMatchObject({
      outcome: 'NEEDS_CLARIFICATION',
      candidate: null,
    });
  });

  it('treats an ambiguous result as conditional rather than guessing', async () => {
    await expect(serviceReturning({ ...candidate, departmentId: 'unknown' }).classify('Something is wrong')).resolves.toMatchObject({
      outcome: 'NEEDS_CLARIFICATION',
    });
  });

  it('uses trusted department context over an advisory department guess', async () => {
    await expect(serviceReturning({ ...candidate, departmentId: 'HR' }).classify('Laptop issue', 'IT')).resolves.toMatchObject({
      outcome: 'READY',
      candidate: { ...candidate, departmentId: 'IT' },
    });
  });

  it('keeps conditional behavior when trusted context is absent', async () => {
    await expect(serviceReturning({ ...candidate, departmentId: null }).classify('Laptop issue')).resolves.toMatchObject({
      outcome: 'NEEDS_CLARIFICATION',
      clarification: expect.stringContaining('department'),
    });
  });

  it('rejects an AI value outside the product category set', async () => {
    await expect(serviceReturning({ ...candidate, category: 'SecurityIncident' }).classify('laptop issue')).resolves.toMatchObject({
      outcome: 'INVALID_AI_OUTPUT',
      candidate: null,
    });
  });

  it('returns an explicit unavailable result when the provider fails', async () => {
    const provider: IntakeProvider = { complete: async () => { throw new Error('provider down'); } };
    await expect(new IntakeService(provider).classify('laptop issue')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(new IntakeService(provider).classify('laptop issue')).rejects.toMatchObject({
      response: { outcome: 'PROVIDER_UNAVAILABLE', candidate: null },
    });
  });
});