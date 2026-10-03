export const SHIPMENTS_URL = '/shipments';

/**
 * Where "Back" on the detail page goes. The grid hands its own URL (with filters and
 * page) over in the navigation state; anything that is not an in-app shipments URL
 * is ignored, so a crafted history state cannot redirect the user elsewhere.
 */
export function backUrlFrom(state: unknown): string {
  const back = (state as { back?: unknown } | null)?.back;
  const valid =
    typeof back === 'string' &&
    (back === SHIPMENTS_URL || back.startsWith(`${SHIPMENTS_URL}?`)) &&
    !back.includes('//');
  return valid ? back : SHIPMENTS_URL;
}
