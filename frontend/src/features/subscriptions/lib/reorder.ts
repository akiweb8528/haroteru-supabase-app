import type { TrackedSubscription } from '@/types';

function sortByPosition(items: TrackedSubscription[]): TrackedSubscription[] {
  return [...items].sort((a, b) => a.position - b.position);
}

export function reorderSubscriptionsWithHiddenItems(
  allSubscriptions: TrackedSubscription[],
  visibleSubscriptions: TrackedSubscription[],
  draggedId: string,
  targetId: string,
): TrackedSubscription[] {
  if (draggedId === targetId) {
    return sortByPosition(allSubscriptions);
  }

  const ordered = sortByPosition(allSubscriptions);
  const sourceIndex = ordered.findIndex((item) => item.id === draggedId);
  const targetIndex = ordered.findIndex((item) => item.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return ordered;
  }

  const visibleIds = new Set(visibleSubscriptions.map((item) => item.id));
  if (!visibleIds.has(draggedId) || !visibleIds.has(targetId)) {
    return ordered;
  }

  const movingDown = sourceIndex < targetIndex;
  const dragged = ordered[sourceIndex];
  const remaining = ordered.filter((item) => item.id !== draggedId);
  const targetIndexAfterRemoval = remaining.findIndex((item) => item.id === targetId);
  if (targetIndexAfterRemoval === -1) {
    return ordered;
  }

  const insertAt = movingDown ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;
  const next = [...remaining];
  next.splice(insertAt, 0, dragged);

  return next.map((item, index) => ({
    ...item,
    position: index,
  }));
}

export function buildReorderPayload(items: TrackedSubscription[]) {
  return sortByPosition(items).map((item, index) => ({
    id: item.id,
    position: index,
  }));
}
