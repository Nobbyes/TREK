/* Decorative section photography. It reads rendered page structure only. */
(() => {
  'use strict';
  const sections = {
    overview: { scene: 'trail', label: 'TRAIL / EVERYDAY PROGRESS', position: '62% 52%' },
    log: { scene: 'road', label: 'RUN / KEEP THE MOMENTUM', position: '68% 52%' },
    library: { scene: 'strength', label: 'STRENGTH / BUILD YOUR BASE', position: '70% 50%' },
    health: { scene: 'recovery', label: 'RECOVER / FIND YOUR BALANCE', position: '68% 50%' },
    coach: { scene: 'coach', label: 'PLAN / YOUR NEXT STEP', position: '68% 50%' }
  };
  window.WildSectionImagery?.dispose();
  let frame = 0, observer = null, disposed = false;
  const previousArtwork = new WeakMap();
  const assetFor = (key, section) => {
    const assets = window.JinshanPhotoAssets?.sections || {};
    const asset = assets[key] || assets[section.scene];
    return typeof asset === 'string' ? { src: asset } : asset || null;
  };
  function photograph(host, key, section, variant) {
    const asset = assetFor(key, section);
    if (!asset?.src) return;
    let url;
    try {
      url = new URL(asset.src, document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol)) return;
    } catch { return; }
    if (host.dataset.sectionPhoto === key && host.dataset.sectionPhotoSrc === url.href && host.querySelector(':scope > .section-imagery-photo')) return;
    if (host.dataset.sectionPhotoError === url.href) return;
    host.querySelectorAll(':scope > .section-imagery-photo, :scope > .section-imagery-label').forEach(node => node.remove());
    host.dataset.sectionPhoto = key;
    host.dataset.sectionPhotoSrc = url.href;
    host.classList.remove('section-imagery-ready', 'section-imagery-unavailable');
    host.classList.add('section-imagery', `section-imagery--${variant}`);
    const image = document.createElement('img');
    image.className = 'section-imagery-photo';
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.decoding = 'async';
    image.loading = 'eager';
    image.fetchPriority = key === 'overview' ? 'high' : 'auto';
    image.style.objectPosition = asset.position || section.position;
    const credit = document.createElement('span');
    credit.className = 'section-imagery-label';
    credit.setAttribute('aria-hidden', 'true');
    credit.textContent = section.label;
    image.addEventListener('load', () => {
      if (disposed || !image.isConnected) return;
      host.classList.add('section-imagery-ready');
      // Hide only the overview artwork, preserving it for fallback and disposal.
      const artwork = variant === 'overview' ? host.querySelector('.hero-landscape') : null;
      if (artwork) {
        if (!previousArtwork.has(host)) previousArtwork.set(host, { node: artwork, hidden: artwork.hidden });
        artwork.hidden = true;
      }
    }, { once: true });
    image.addEventListener('error', () => {
      if (disposed || !image.isConnected) return;
      image.remove();
      host.classList.add('section-imagery-unavailable');
      delete host.dataset.sectionPhoto;
      host.dataset.sectionPhotoError = url.href;
      credit.remove();
      const artwork = previousArtwork.get(host);
      if (artwork) artwork.node.hidden = artwork.hidden;
    }, { once: true });
    host.prepend(image);
    host.append(credit);
    image.src = url.href;
  }
  function enhance() {
    frame = 0;
    if (disposed) return;
    const key = location.hash.slice(1) || 'overview';
    const section = sections[key];
    const main = document.querySelector('#main');
    if (!section || !main) return;
    if (key === 'overview') {
      const hero = main.querySelector(':scope > .hero');
      if (hero) photograph(hero, key, section, 'overview');
    } else {
      const heading = main.querySelector(':scope > .page-heading');
      if (heading) photograph(heading, key, section, 'heading');
    }
  }
  function schedule() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(enhance);
  }
  function refresh() {
    document.querySelectorAll('[data-section-photo-error]').forEach(node => { delete node.dataset.sectionPhotoError; });
    schedule();
  }
  function dispose() {
    disposed = true;
    observer?.disconnect();
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('hashchange', schedule);
    window.removeEventListener('jinshan:imagery-ready', refresh);
    document.querySelectorAll('#main .section-imagery').forEach(host => {
      host.querySelectorAll(':scope > .section-imagery-photo, :scope > .section-imagery-label').forEach(node => node.remove());
      const artwork = previousArtwork.get(host);
      if (artwork) artwork.node.hidden = artwork.hidden;
      host.classList.remove('section-imagery', 'section-imagery--heading', 'section-imagery--overview', 'section-imagery-ready', 'section-imagery-unavailable');
      delete host.dataset.sectionPhoto;
      delete host.dataset.sectionPhotoSrc;
      delete host.dataset.sectionPhotoError;
    });
  }
  function imageCredits() {
    const footer=document.querySelector('footer');if(!footer||footer.querySelector('.image-credits'))return;
    const entries=Object.values(window.JinshanPhotoAssets?.races||{}).concat(Object.values(window.JinshanPhotoAssets?.sections||{}));
    if(!entries.length)return;const box=document.createElement('details');box.className='image-credits';const summary=document.createElement('summary');summary.textContent='影像来源与署名';box.append(summary);const list=document.createElement('ul'),seen=new Set();
    for(const item of entries){if(!/^https:\/\//.test(item.sourcePage||'')||seen.has(item.sourcePage))continue;seen.add(item.sourcePage);const row=document.createElement('li'),link=document.createElement('a');link.href=item.sourcePage;link.target='_blank';link.rel='noopener noreferrer';link.textContent=(item.caption||'训练场景')+' · '+(item.credit||'图片来源');row.append(link);list.append(row)}
    box.append(list);footer.append(box);
  }
  function start() {
    imageCredits();
    const main = document.querySelector('#main');
    if (!main || disposed) return;
    observer = new MutationObserver(schedule);
    observer.observe(main, { childList: true, subtree: true });
    window.addEventListener('hashchange', schedule);
    window.addEventListener('jinshan:imagery-ready', refresh);
    schedule();
  }
  window.WildSectionImagery = { refresh, dispose };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
