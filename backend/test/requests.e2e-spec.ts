import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { RequestStatus } from '../src/requests/enums/request-status.enum';

jest.setTimeout(15000);

describe('requests API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => app.close());

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
});
