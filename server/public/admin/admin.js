(function () {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('admin-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!toggle || !sidebar || !backdrop) return;

  const mq = window.matchMedia('(min-width: 900px)');

  function isDesktop() {
    return mq.matches;
  }

  function applyDesktopSidebar() {
    document.body.classList.remove('sidebar-open');
    sidebar.removeAttribute('inert');
    sidebar.setAttribute('aria-hidden', 'false');
    backdrop.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    const hint = toggle.querySelector('.visually-hidden');
    if (hint) hint.textContent = 'Buka menu';
  }

  function setOpen(open) {
    if (isDesktop()) return;
    document.body.classList.toggle('sidebar-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    sidebar.setAttribute('aria-hidden', open ? 'false' : 'true');
    backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    const hint = toggle.querySelector('.visually-hidden');
    if (hint) hint.textContent = open ? 'Tutup menu' : 'Buka menu';
    if (open) sidebar.removeAttribute('inert');
    else sidebar.setAttribute('inert', '');
  }

  function onViewportChange() {
    if (isDesktop()) applyDesktopSidebar();
    else setOpen(false);
  }

  toggle.addEventListener('click', function () {
    if (isDesktop()) return;
    setOpen(!document.body.classList.contains('sidebar-open'));
  });
  backdrop.addEventListener('click', function () {
    setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('sidebar-open') && !isDesktop()) setOpen(false);
  });
  sidebar.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      if (!isDesktop()) setOpen(false);
    });
  });

  if (mq.addEventListener) mq.addEventListener('change', onViewportChange);
  else mq.addListener(onViewportChange);
  onViewportChange();
})();

(function () {
  const links = document.querySelectorAll('.tab-link');
  const panes = document.querySelectorAll('.tab-pane');
  if (!links.length) return;

  function activate(tab) {
    links.forEach((l) => l.classList.toggle('tab-active', l.dataset.tab === tab));
    panes.forEach((p) => p.classList.toggle('tab-pane-active', p.id === 'tab-' + tab));
  }

  links.forEach((l) => {
    l.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = l.dataset.tab;
      activate(tab);
      history.replaceState(null, '', '#' + tab);
    });
  });

  const hash = (location.hash || '').replace('#', '');
  if (hash && document.getElementById('tab-' + hash)) activate(hash);
})();
