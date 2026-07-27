export const getVisualViewportHeight = () => Math.max(1, window.visualViewport?.height ?? window.innerHeight);
export const getElementVisibleRatio = (element: Element, viewportHeight = getVisualViewportHeight()) => {
    const rect = element.getBoundingClientRect();
    const visibleTop = Math.max(0, rect.top);
    const visibleBottom = Math.min(viewportHeight, rect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    return visibleHeight / Math.max(1, Math.min(rect.height, viewportHeight));
};
