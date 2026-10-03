import { describe, expect, it } from 'vitest';
import { INITIAL_STATUS, SHIPMENT_STATUSES, STATUS_LABELS, nextStatus } from './domain.js';

describe('nextStatus', () => {
  it('moves forward exactly one step at a time', () => {
    expect(nextStatus('RECEIVED_AT_ORIGIN')).toBe('RECEIVED_AT_DESTINATION');
    expect(nextStatus('RECEIVED_AT_DESTINATION')).toBe('DELIVERED');
  });

  it('has no next step once delivered', () => {
    expect(nextStatus('DELIVERED')).toBeNull();
  });

  it('walks the whole lifecycle from the initial status without skipping or repeating', () => {
    const walked = [INITIAL_STATUS];
    for (let next = nextStatus(INITIAL_STATUS); next; next = nextStatus(next)) walked.push(next);
    expect(walked).toEqual([...SHIPMENT_STATUSES]);
  });

  it('starts at the first status', () => {
    expect(INITIAL_STATUS).toBe('RECEIVED_AT_ORIGIN');
  });

  it('has a label for every status', () => {
    for (const status of SHIPMENT_STATUSES) expect(STATUS_LABELS[status]).toBeTruthy();
  });
});
