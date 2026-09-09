import { RequestStatus } from '../enums/request-status.enum';

// Fields match docs/data-model.md's Request attribute list.
export class RequestEntity {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  departmentId: string;
  createdBy: string;
  assignedTo: string | null;
  status: RequestStatus;
  createdAt: Date;
}
