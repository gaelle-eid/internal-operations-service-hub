import { RequestStatus } from './enums/request-status.enum';
import { VALID_TRANSITIONS } from './requests.service';

describe('request lifecycle business rule', () => {
  it('allows only the next legal status and rejects skipping assignment', () => {
    expect(VALID_TRANSITIONS[RequestStatus.SUBMITTED]).toContain(RequestStatus.ASSIGNED);
    expect(VALID_TRANSITIONS[RequestStatus.SUBMITTED]).not.toContain(RequestStatus.IN_PROGRESS);
  });

  it('covers the full lifecycle from submission through resolution and close', () => {
    expect(VALID_TRANSITIONS[RequestStatus.SUBMITTED]).toContain(RequestStatus.ASSIGNED);
    expect(VALID_TRANSITIONS[RequestStatus.ASSIGNED]).toContain(RequestStatus.IN_PROGRESS);
    expect(VALID_TRANSITIONS[RequestStatus.IN_PROGRESS]).toContain(RequestStatus.WAITING_ON_REQUESTER);
    expect(VALID_TRANSITIONS[RequestStatus.IN_PROGRESS]).toContain(RequestStatus.RESOLVED);
    expect(VALID_TRANSITIONS[RequestStatus.WAITING_ON_REQUESTER]).toContain(RequestStatus.IN_PROGRESS);
    expect(VALID_TRANSITIONS[RequestStatus.WAITING_ON_REQUESTER]).toContain(RequestStatus.RESOLVED);
    expect(VALID_TRANSITIONS[RequestStatus.RESOLVED]).toContain(RequestStatus.IN_PROGRESS);
    expect(VALID_TRANSITIONS[RequestStatus.RESOLVED]).toContain(RequestStatus.CLOSED);
    expect(VALID_TRANSITIONS[RequestStatus.CLOSED]).toEqual([]);
  });

  it('rejects illegal transitions that skip required steps', () => {
    expect(VALID_TRANSITIONS[RequestStatus.SUBMITTED]).not.toContain(RequestStatus.WAITING_ON_REQUESTER);
    expect(VALID_TRANSITIONS[RequestStatus.ASSIGNED]).not.toContain(RequestStatus.RESOLVED);
    expect(VALID_TRANSITIONS[RequestStatus.IN_PROGRESS]).not.toContain(RequestStatus.CLOSED);
  });
});
