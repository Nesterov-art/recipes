import { useEffect, useState } from 'react';

export function useSystemFontScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.dataset.systemFontProbe = '';
    Object.assign(probe.style, {
      position: 'fixed', display: 'block', visibility: 'hidden', pointerEvents: 'none',
      width: '1em', height: '1em', fontSize: '1rem',
    });
    // Safari exposes Dynamic Type through the system body font. Other browsers
    // expose the preferred default font through rem. Normal body sizes are 17/16.
    const dynamicType = CSS.supports('font', '-apple-system-body');
    if (dynamicType) probe.style.font = '-apple-system-body';
    document.body.appendChild(probe);
    const update = () => {
      const size = Number.parseFloat(getComputedStyle(probe).fontSize);
      if (Number.isFinite(size) && size > 0) setScale(size / (dynamicType ? 17 : 16));
    };
    const observer = new ResizeObserver(update);
    observer.observe(probe);
    window.addEventListener('pageshow', update);
    update();
    return () => { observer.disconnect(); window.removeEventListener('pageshow', update); probe.remove(); };
  }, []);
  return scale;
}
