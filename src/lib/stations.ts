import type { ItemStatus, OrderStatus, Station } from './types';

// Station routing: drinks are made at the bar, food in the kitchen. Each order line has its own
// status; the order's overall status is worked out from its lines (same rules as 0005_stations.sql).

export const STATIONS: Station[] = ['bar', 'kitchen'];
export const STATION_NAME: Record<Station, string> = { bar: 'Bar', kitchen: 'Kitchen' };
export const STATION_GOODS: Record<Station, string> = { bar: 'Drinks', kitchen: 'Food' };
export const STATION_ICON: Record<Station, string> = { bar: '☕', kitchen: '🍳' };

type Line = { station?: Station | null; status?: ItemStatus | null };

export const stationOf = (line: Line): Station => line.station ?? 'kitchen';

/** A line's status, falling back to the order's status for lines saved before stations existed. */
export function lineStatus(orderStatus: OrderStatus, line: Line): ItemStatus {
  if (orderStatus === 'served') return 'ready';
  if (line.status) return line.status;
  return orderStatus === 'preparing' ? 'preparing' : orderStatus === 'ready' ? 'ready' : 'new';
}

/** All ready → ready; anything started → preparing; otherwise new. */
export function rollup(statuses: ItemStatus[]): ItemStatus {
  if (statuses.length && statuses.every(s => s === 'ready')) return 'ready';
  return statuses.some(s => s !== 'new') ? 'preparing' : 'new';
}

export function stationsIn(lines: Line[]): Station[] {
  return STATIONS.filter(st => lines.some(l => stationOf(l) === st));
}

/** How far one station is with its part of an order (null when the order has nothing for that station). */
export function stationStatus(orderStatus: OrderStatus, lines: Line[], station: Station): ItemStatus | null {
  const mine = lines.filter(l => stationOf(l) === station);
  return mine.length ? rollup(mine.map(l => lineStatus(orderStatus, l))) : null;
}

/** Move one station's lines (or every line, when station is null) to preparing/ready, and re-derive the order status. */
export function applyStationStatus<O extends { status: OrderStatus; order_items: L[] }, L extends Line>(
  order: O, station: Station | null, to: 'preparing' | 'ready',
): O {
  const order_items = order.order_items.map(l => {
    const cur = lineStatus(order.status, l);
    if (station && stationOf(l) !== station) return { ...l, status: cur };
    return { ...l, status: to === 'ready' ? 'ready' : cur === 'new' ? 'preparing' : cur };
  });
  const closed = order.status === 'served' || order.status === 'cancelled';
  return { ...order, order_items, status: closed ? order.status : rollup(order_items.map(l => l.status as ItemStatus)) };
}

/** A sensible station for a new category, from its name (the owner can switch it). */
export function guessStation(categoryName: string): Station {
  return /\b(coffee|kape|drinks?|inumin|beverages?|teas?|lattes?|espresso|frapp|blended|refreshers?|juices?|smoothies?|shakes?|sodas?|matcha|cocoa)/i
    .test(categoryName) ? 'bar' : 'kitchen';
}
