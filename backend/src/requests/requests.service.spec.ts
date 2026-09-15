import { RequestStatus } from './enums/request-status.enum';
import { VALID_TRANSITIONS } from './requests.service';

describe('request lifecycle business rule', () => {
  it('allows only the next legal status and rejects skipping assignment', () => {
    expect(VALID_TRANSITIONS[RequestStatus.SUBMITTED]).toContain(RequestStatus.ASSIGNED);
    expect(VALID_TRANSITIONS[RequestStatus.SUBMITTED]).not.toContain(RequestStatus.IN_PROGRESS);
  });
});
