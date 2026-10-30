/** Plain-language message status shown in chat bubbles (src/lib/deliveryLabel.ts). */

import type { MessageDeliveryState } from '../mesh/types';

export function deliveryLabel(state: MessageDeliveryState, hops: number): string {
  switch (state) {
    case 'PENDING':
      return 'Waiting for a nearby phone';
    case 'SENT':
      return 'Sent';
    case 'RELAYED':
      return `Passed along (${hops} hop${hops === 1 ? '' : 's'})`;
    case 'DELIVERED':
      return 'Delivered';
  }
}
