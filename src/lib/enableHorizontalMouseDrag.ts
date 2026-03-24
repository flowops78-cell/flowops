const HORIZONTAL_SCROLL_SELECTOR = '.overflow-x-auto, .overflow-x-scroll';
const INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,label,[role="button"],[contentediactivity="true"]';

export const enableHorizontalMouseDrag = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  let activeDrag:
    | {
        container: HTMLElement;
        startX: number;
        startScrollLeft: number;
        didDrag: boolean;
      }
    | null = null;

  const refreshDragEnabledContainers = () => {
    const containers = document.querySelectorAll<HTMLElement>(HORIZONTAL_SCROLL_SELECTOR);
    containers.forEach(container => {
      const isScrollable = container.scrollWidth > container.clientWidth + 1;
      container.classList.toggle('drag-scroll-enabled', isScrollable);
    });
  };

  let suppressClickContainer: HTMLElement | null = null;
  let suppressClickTimer: number | null = null;

  const clearSuppressClick = () => {
    suppressClickContainer = null;
    if (suppressClickTimer !== null) {
      window.clearTimeout(suppressClickTimer);
      suppressClickTimer = null;
    }
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;

    const container = target.closest(HORIZONTAL_SCROLL_SELECTOR) as HTMLElement | null;
    if (!container) return;
    if (container.scrollWidth <= container.clientWidth) return;
    if (target.closest(INTERACTIVE_SELECTOR)) return;

    event.preventDefault();

    activeDrag = {
      container,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
      didDrag: true,
    };

    container.classList.add('drag-scroll-active');
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!activeDrag) return;

    const deltaX = event.clientX - activeDrag.startX;
    activeDrag.container.scrollLeft = activeDrag.startScrollLeft - deltaX;
    event.preventDefault();
  };

  const onMouseUp = () => {
    if (!activeDrag) return;

    const { container, didDrag } = activeDrag;
    container.classList.remove('drag-scroll-active');

    if (didDrag) {
      suppressClickContainer = container;
      suppressClickTimer = window.setTimeout(() => {
        clearSuppressClick();
      }, 120);
    }

    activeDrag = null;
  };

  const onClickCapture = (event: MouseEvent) => {
    if (!suppressClickContainer) return;

    const target = event.target as Node | null;
    if (target && suppressClickContainer.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      clearSuppressClick();
    }
  };

  refreshDragEnabledContainers();

  document.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove, { passive: false });
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('resize', refreshDragEnabledContainers);
  document.addEventListener('click', onClickCapture, true);

  const mutationObserver = new MutationObserver(() => {
    refreshDragEnabledContainers();
  });
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });

  return () => {
    document.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('resize', refreshDragEnabledContainers);
    document.removeEventListener('click', onClickCapture, true);
    mutationObserver.disconnect();
    clearSuppressClick();
  };
};
