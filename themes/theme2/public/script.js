(function () {
  const siteCtx = window.__SITE__ || {};
  const apiBase = siteCtx.apiBase || '/api';
  const allWishes = Array.isArray(window.__WISHES__) ? window.__WISHES__.slice() : [];

  function g(id) { return document.getElementById(id); }
  function escHtml(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  function updateCountdown() {
    const iso = siteCtx.weddingDate; if (!iso) return;
    const wedding = new Date(iso);
    const diff = wedding - new Date();
    const set = (id, v) => { const el = g(id); if (el) el.textContent = v; };
    if (diff <= 0) { set('cd-days',0); set('cd-hours',0); set('cd-mins',0); set('cd-secs',0); return; }
    set('cd-days', Math.floor(diff / 86400000));
    set('cd-hours', Math.floor((diff % 86400000) / 3600000));
    set('cd-mins', Math.floor((diff % 3600000) / 60000));
    set('cd-secs', Math.floor((diff % 60000) / 1000));
  }

  function revealOnScroll() {
    document.querySelectorAll('.fade-up:not(.visible)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) el.classList.add('visible');
    });
  }

  function renderWishes() {
    const list = g('wishes-list'); const empty = g('wishes-empty');
    if (!list) return;
    if (allWishes.length === 0) { list.innerHTML = ''; if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    const sorted = allWishes.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    list.innerHTML = '';
    sorted.forEach((w) => {
      const div = document.createElement('div');
      div.className = 'rounded-2xl p-4';
      div.style.cssText = 'background:rgba(255,255,255,.6);border:1px solid rgba(184,197,176,.2)';
      div.innerHTML = `<p class="font-serif text-sage-800 mb-1">${escHtml(w.guest_name)}</p><p class="text-sage-500 text-sm">${escHtml(w.message)}</p>`;
      list.appendChild(div);
    });
  }

  const appEl = g('app');

  function setActiveNavByHash(hash) {
    document.querySelectorAll('#navbar .nav-link').forEach((l) => l.classList.toggle('nav-link-active', l.getAttribute('href') === hash));
  }
  function animateNavTap(link) { link.classList.remove('nav-link-clicked'); void link.offsetWidth; link.classList.add('nav-link-clicked'); }

  function handleNavClick(e) {
    const link = e.currentTarget;
    const hash = link.getAttribute('href');
    if (!hash || !hash.startsWith('#')) return;
    const target = document.querySelector(hash);
    if (!target) return;
    e.preventDefault();
    const navH = g('navbar').offsetHeight;
    appEl.scrollTo({ top: Math.max(0, target.offsetTop - navH + 4), behavior: 'smooth' });
    setActiveNavByHash(hash);
    animateNavTap(link);
    history.replaceState(null, '', hash);
    const mm = g('mobile-menu'); if (mm) mm.classList.add('hidden');
  }

  const mmBtn = g('mobile-menu-btn');
  if (mmBtn) mmBtn.addEventListener('click', () => g('mobile-menu').classList.toggle('hidden'));

  document.querySelectorAll("#navbar a[href^='#'], #mobile-menu a[href^='#']").forEach((a) => a.addEventListener('click', handleNavClick));

  appEl.addEventListener('scroll', () => {
    revealOnScroll();
    let current = '';
    document.querySelectorAll('section').forEach((s) => {
      if (appEl.scrollTop >= s.offsetTop - 120) current = s.id;
    });
    if (current) setActiveNavByHash('#' + current);
  });

  async function postJson(path, body) {
    const res = await fetch(apiBase + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }

  const rsvpForm = g('rsvp-form');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = g('rsvp-btn'); const toast = g('rsvp-toast');
      const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Sending...';
      try {
        const slug = siteCtx.slug;
        if (!slug) throw new Error('missing site slug');
        await postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
          guest_name: g('rsvp-name').value.trim(),
          guest_phone: g('rsvpPhone') && g('rsvpPhone').value.trim() ? g('rsvpPhone').value.trim().slice(0, 40) : null,
          attendance: g('rsvp-attend').value,
          guests_count: parseInt(g('rsvp-guests').value, 10) || 1,
          notes: g('rsvp-notes').value.trim() || null,
        });
        if (toast) { toast.textContent = 'Thank you for your RSVP!'; toast.classList.remove('hidden'); }
        rsvpForm.reset();
      } catch (err) {
        if (toast) { toast.textContent = 'Failed: ' + err.message; toast.classList.remove('hidden'); }
      } finally { btn.disabled = false; btn.textContent = orig; }
    });
  }

  const wishForm = g('wish-form');
  if (wishForm) {
    wishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = g('wish-btn'); btn.disabled = true;
      try {
        const slug = siteCtx.slug;
        if (!slug) throw new Error('missing site slug');
        const payload = { guest_name: g('wish-name').value.trim(), message: g('wish-msg').value.trim() };
        const { wish } = await postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', payload);
        allWishes.push(wish || { ...payload, created_at: new Date().toISOString() });
        renderWishes();
        wishForm.reset();
      } catch (err) {
        alert('Failed: ' + err.message);
      } finally { btn.disabled = false; }
    });
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
  setTimeout(revealOnScroll, 200);
  renderWishes();

  if (window.lightbox) { lightbox.option({ resizeDuration: 200, wrapAround: true, fadeDuration: 200, imageFadeDuration: 200, showImageNumberLabel: false }); }
})();
