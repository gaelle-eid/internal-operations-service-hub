export type MockUser = {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'staff' | 'manager' | 'admin';
  departmentId: string | null;
};

// Demo fixtures only (docs/workflow.md: use mock data only). In mock mode these are seeded into
// the persisted `users` table by DirectoryService; after that the database, not this list, is the
// source of truth for who is registered.
export const MOCK_USERS: ReadonlyArray<MockUser> = Object.freeze([
  { id: 'employee-1', name: 'Employee One', email: 'employee-1@example.com', role: 'employee', departmentId: null },
  { id: 'employee-notifications-1', name: 'Employee Notifications One', email: 'employee-notifications-1@example.com', role: 'employee', departmentId: null },
  { id: 'it-staff-1', name: 'IT Staff One', email: 'it-staff-1@example.com', role: 'staff', departmentId: 'IT' },
  { id: 'it-staff-2', name: 'IT Staff Two', email: 'it-staff-2@example.com', role: 'staff', departmentId: 'IT' },
  { id: 'it-manager-1', name: 'IT Manager One', email: 'it-manager-1@example.com', role: 'manager', departmentId: 'IT' },
  { id: 'it-admin-1', name: 'IT Admin One', email: 'it-admin-1@example.com', role: 'admin', departmentId: 'IT' },
  { id: 'hr-staff-1', name: 'HR Staff One', email: 'hr-staff-1@example.com', role: 'staff', departmentId: 'HR' },
  { id: 'hr-manager-1', name: 'HR Manager One', email: 'hr-manager-1@example.com', role: 'manager', departmentId: 'HR' },
  { id: 'hr-admin-1', name: 'HR Admin One', email: 'hr-admin-1@example.com', role: 'admin', departmentId: 'HR' },
  { id: 'finance-staff-1', name: 'Finance Staff One', email: 'finance-staff-1@example.com', role: 'staff', departmentId: 'Finance' },
  { id: 'finance-manager-1', name: 'Finance Manager One', email: 'finance-manager-1@example.com', role: 'manager', departmentId: 'Finance' },
  { id: 'finance-admin-1', name: 'Finance Admin One', email: 'finance-admin-1@example.com', role: 'admin', departmentId: 'Finance' },
]);

export function getAuthMode(): 'mock' | 'oidc' | string {
  return process.env.AUTH_MODE ?? (process.env.NODE_ENV === 'test' ? 'mock' : 'oidc');
}