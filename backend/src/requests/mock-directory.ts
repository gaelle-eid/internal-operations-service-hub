import type { RequestActor } from './requests.service';

export const MOCK_DIRECTORY: Readonly<Record<string, RequestActor>> = Object.freeze({
  'employee-1': { id: 'employee-1', role: 'employee' },
  'employee-notifications-1': { id: 'employee-notifications-1', role: 'employee' },
  'it-staff-1': { id: 'it-staff-1', role: 'staff', departmentId: 'IT' },
  'it-staff-2': { id: 'it-staff-2', role: 'staff', departmentId: 'IT' },
  'it-admin-1': { id: 'it-admin-1', role: 'admin', departmentId: 'IT' },
  'hr-staff-1': { id: 'hr-staff-1', role: 'staff', departmentId: 'HR' },
  'hr-admin-1': { id: 'hr-admin-1', role: 'admin', departmentId: 'HR' },
  'finance-staff-1': { id: 'finance-staff-1', role: 'staff', departmentId: 'Finance' },
  'finance-admin-1': { id: 'finance-admin-1', role: 'admin', departmentId: 'Finance' },
});

export function getMockActor(userId: string): RequestActor | undefined {
  return MOCK_DIRECTORY[userId];
}

export function getAuthMode(): 'mock' | 'oidc' | string {
  return process.env.AUTH_MODE ?? (process.env.NODE_ENV === 'test' ? 'mock' : 'oidc');
}