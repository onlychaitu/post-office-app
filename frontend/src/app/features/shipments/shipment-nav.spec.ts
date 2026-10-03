import { backUrlFrom } from './shipment-nav';

describe('backUrlFrom', () => {
  it('returns the grid URL handed over in the state, with its filters and page', () => {
    expect(backUrlFrom({ back: '/shipments?status=DELIVERED&page=2' })).toBe('/shipments?status=DELIVERED&page=2');
    expect(backUrlFrom({ back: '/shipments' })).toBe('/shipments');
  });

  it('defaults to the shipments list when there is no usable state', () => {
    expect(backUrlFrom(null)).toBe('/shipments');
    expect(backUrlFrom(undefined)).toBe('/shipments');
    expect(backUrlFrom({})).toBe('/shipments');
    expect(backUrlFrom({ back: 42 })).toBe('/shipments');
  });

  it('ignores anything that is not an in-app shipments URL', () => {
    for (const back of [
      'https://evil.example/shipments',
      '//evil.example',
      '/post-offices',
      '/shipments/SHP-0000000001',
      '/shipments-other',
      '/shipments?next=//evil.example',
    ]) {
      expect(backUrlFrom({ back })).toBe('/shipments');
    }
  });
});
