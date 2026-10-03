import { SHIPMENT_STATUSES, nextStatus, officeLabel } from './models';

describe('nextStatus', () => {
  it('moves one step forward and stops at delivered', () => {
    expect(nextStatus('RECEIVED_AT_ORIGIN')).toBe('RECEIVED_AT_DESTINATION');
    expect(nextStatus('RECEIVED_AT_DESTINATION')).toBe('DELIVERED');
    expect(nextStatus('DELIVERED')).toBeNull();
  });

  it('follows the lifecycle order of SHIPMENT_STATUSES', () => {
    expect([...SHIPMENT_STATUSES]).toEqual(['RECEIVED_AT_ORIGIN', 'RECEIVED_AT_DESTINATION', 'DELIVERED']);
  });
});

describe('officeLabel', () => {
  it('formats "ZIP · name"', () => {
    expect(officeLabel({ zipCode: '10001', name: 'Midtown Post Office' })).toBe('10001 · Midtown Post Office');
  });
});
