import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { RequestStatus } from '../src/requests/enums/request-status.enum';
import { INTAKE_PROVIDER, RequestyIntakeProvider } from '../src/requests/intake/intake.provider';

jest.setTimeout(15000);

describe('requests API (e2e)', () => {
  let app: INestApplication;
  const originalAuthMode = process.env.AUTH_MODE;

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    process.env.AUTH_MODE = 'mock';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RequestyIntakeProvider)
      .useValue({
        complete: async (text: string) => text.includes('laptop')
          ? { title: 'Laptop will not boot', description: text, category: 'Hardware', priority: 'High', departmentId: 'IT' }
          : { title: text, description: text, category: 'Other', priority: 'Medium', departmentId: null },
      })
      .overrideProvider(INTAKE_PROVIDER)
      .useValue({
        complete: async (text: string) => text.includes('laptop')
          ? { title: 'Laptop will not boot', description: text, category: 'Hardware', priority: 'High', departmentId: 'IT' }
          : { title: text, description: text, category: 'Other', priority: 'Medium', departmentId: null },
        completeWithTools: async (text: string) => ({ content: null, toolCall: { name: 'get_request_status', arguments: JSON.stringify({ requestId: text.match(/[0-9a-f-]{36}/i)?.[0] }) } }),
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = originalAuthMode;
  });

  it('submits, claims, and blocks a cross-department staff member', async () => {
    const employeeHeaders = { 'x-user-id': 'employee-1', 'x-user-role': 'employee' };
    const created = await request(app.getHttpServer())
      .post('/requests')
      .set(employeeHeaders)
      .send({ title: 'Laptop issue', description: 'It will not boot', category: 'Hardware', priority: 'High', departmentId: 'IT', createdBy: 'employee-1' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/requests/${created.body.id}/status`)
      .set({ 'x-user-id': 'hr-1', 'x-user-role': 'staff', 'x-department-id': 'HR' })
      .send({ toStatus: RequestStatus.ASSIGNED, changedBy: 'hr-1' })
      .expect(403);

    const claimed = await request(app.getHttpServer())
      .patch(`/requests/${created.body.id}/status`)
      .set({ 'x-user-id': 'it-1', 'x-user-role': 'staff', 'x-department-id': 'IT' })
      .send({ toStatus: RequestStatus.ASSIGNED, changedBy: 'it-1' })
      .expect(200);

    expect(claimed.body.status).toBe(RequestStatus.ASSIGNED);
  });

  it('rejects an invalid request deliberately', async () => {
    await request(app.getHttpServer())
      .post('/requests')
      .set({ 'x-user-id': 'employee-1', 'x-user-role': 'employee' })
      .send({ title: '', description: 'missing title', category: 'Hardware', priority: 'Urgent', departmentId: 'IT', createdBy: 'employee-1' })
      .expect(400);
  });

  it('rejects caller-supplied identity headers when OIDC authentication is required', async () => {
    const originalAuthMode = process.env.AUTH_MODE;
    process.env.AUTH_MODE = 'oidc';
    try {
      await request(app.getHttpServer())
        .get('/requests')
        .set({ 'x-user-id': 'forged-admin', 'x-user-role': 'admin', 'x-department-id': 'IT' })
        .expect(401);
    } finally {
      if (originalAuthMode === undefined) delete process.env.AUTH_MODE;
      else process.env.AUTH_MODE = originalAuthMode;
    }
  });

  it('lists persisted notifications for the authenticated mock employee', async () => {
    const headers = { 'x-user-id': 'employee-notifications-1', 'x-user-role': 'employee' };
    const created = await request(app.getHttpServer())
      .post('/requests')
      .set(headers)
      .send({ title: 'Mock notification test', description: 'Verify notification delivery', category: 'Other', priority: 'Low', departmentId: 'IT', createdBy: 'employee-notifications-1' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/requests/notifications')
      .set(headers)
      .expect(200);

    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ requestId: created.body.id, type: 'STATUS_CHANGE' }),
    ]));
  });

  it('returns a bounded intake candidate without creating a request', async () => {
    const ready = await request(app.getHttpServer())
      .post('/requests/intake')
      .set({ 'x-user-id': 'employee-1', 'x-user-role': 'employee' })
      .send({ text: 'My laptop will not boot and I cannot work' })
      .expect(201);

    expect(ready.body).toMatchObject({
      outcome: 'READY',
      candidate: { category: 'Hardware', priority: 'High', departmentId: 'IT' },
    });

    const unclear = await request(app.getHttpServer())
      .post('/requests/intake')
      .set({ 'x-user-id': 'employee-1', 'x-user-role': 'employee' })
      .send({ text: 'I need help with something' })
      .expect(201);

    expect(unclear.body).toMatchObject({ outcome: 'NEEDS_CLARIFICATION', candidate: null });
  });

  it('executes the read-only Requesty status tool through the API', async () => {
    const created = await request(app.getHttpServer())
      .post('/requests')
      .set({ 'x-user-id': 'employee-1', 'x-user-role': 'employee' })
      .send({ title: 'Status check', description: 'Need a status update', category: 'Other', priority: 'Low', departmentId: 'IT', createdBy: 'employee-1' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/requests/agent')
      .set({ 'x-user-id': 'employee-1', 'x-user-role': 'employee' })
      .send({ message: `What is the status of ${created.body.id}?` })
      .expect(201);

    expect(response.body).toMatchObject({ outcome: 'TOOL_EXECUTED', tool: 'get_request_status', result: { id: created.body.id, status: 'SUBMITTED' } });
  });
});
