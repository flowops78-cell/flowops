export type SectionShortcutDirection = 'next' | 'prev';

export const SECTION_SHORTCUT_EVENT = 'flow-ops:section-shortcut';

export const cycleSectionValue = <T,>(
  values: T[],
  current: T,
  direction: SectionShortcutDirection
): T => {
  if (values.length === 0) return current;
  const currentIndex = values.findIndex(value => value === current);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = direction === 'next'
    ? (safeIndex + 1) % values.length
    : (safeIndex - 1 + values.length) % values.length;
  return values[nextIndex];
};
