(function () {
  const siteCtx = window.__SITE__ || {};
  const apiBase = siteCtx.apiBase || '/api';
  let allWishes = Array.isArray(window.__WISHES__) ? window.__WISHES__.slice() : [];

  function g(id) { return document.getElementById(id); }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function updateCountdown() {
    const iso = siteCtx.weddingDate;
    if (!iso) return;
    const wedding = new Date(String(iso).replace(' ', 'T'));
    const now = new Date();
    const diff = wedding - now;
    const pad = (n) => String(n).padStart(2, '0');
    if (diff <= 0) {
      const el = g('cd-days');
      if (el) el.textContent = '🎉';
      ['cd-hours', 'cd-mins', 'cd-secs'].forEach((id) => { const e = g(id); if (e) e.textContent = ''; });
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const set = (id, v) => { const el = g(id); if (el) el.textContent = v; };
    set('cd-days', pad(d));
    set('cd-hours', pad(h));
    set('cd-mins', pad(m));
    set('cd-secs', pad(s));
  }

  function renderWishes() {
    const container = g('wishes-list');
    const noWishes = g('no-wishes');
    if (!container) return;
    container.innerHTML = '';
    const sorted = allWishes.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    sorted.forEach((w) => {
      const el = document.createElement('div');
      el.className = 'bg-rose-pale/50 rounded-2xl p-5 border border-rose-light/30';
      el.innerHTML = `<p class="text-gray-700 mb-2">"${escHtml(w.message)}"</p><p class="text-sm text-rose-soft font-medium">— ${escHtml(w.guest_name)}</p>`;
      container.appendChild(el);
    });
    if (noWishes) noWishes.style.display = sorted.length === 0 ? 'block' : 'none';
  }

  async function postJson(path, body) {
    const res = await fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }

  const rsvpForm = g('rsvp-form');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const slug = siteCtx.slug;
      const errEl = g('rsvp-error');
      const okEl = g('rsvp-success');
      if (!slug) {
        if (errEl) { errEl.textContent = 'Missing site slug'; errEl.classList.remove('hidden'); }
        return;
      }
      const btn = g('rsvp-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      if (errEl) errEl.classList.add('hidden');
      try {
        await postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
          guest_name: g('rsvp-name').value.trim(),
          guest_phone: g('rsvpPhone') && g('rsvpPhone').value.trim() ? g('rsvpPhone').value.trim().slice(0, 40) : null,
          attendance: g('rsvp-attend').value,
          guests_count: parseInt(g('rsvp-guests').value, 10) || 1,
          notes: g('rsvp-notes').value.trim() || null,
        });
        if (okEl) okEl.classList.remove('hidden');
        rsvpForm.reset();
        setTimeout(() => { if (okEl) okEl.classList.add('hidden'); }, 4000);
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || 'Something went wrong.';
          errEl.classList.remove('hidden');
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Send RSVP'; }
      }
    });
  }

  const wishForm = g('wish-form');
  if (wishForm) {
    wishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const slug = siteCtx.slug;
      const err = g('wish-error');
      if (!slug) return;
      const btn = g('wish-btn');
      if (btn) btn.disabled = true;
      if (err) err.classList.add('hidden');
      try {
        const payload = {
          guest_name: g('wish-name').value.trim(),
          message: g('wish-text').value.trim(),
        };
        const { wish } = await postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', payload);
        allWishes.push(wish || { ...payload, created_at: new Date().toISOString() });
        renderWishes();
        g('wish-name').value = '';
        g('wish-text').value = '';
      } catch (er) {
        if (err) {
          err.textContent = er.message || 'Could not send.';
          err.classList.remove('hidden');
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  document.querySelectorAll('.copy-acct').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const val = btn.getAttribute('data-copy') || '';
      try { await navigator.clipboard.writeText(val); } catch (_) {}
    });
  });

  const mob = g('mobile-menu-btn');
  const mm = g('mobile-menu');
  if (mob && mm) {
    mob.addEventListener('click', () => mm.classList.toggle('hidden'));
    mm.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => mm.classList.add('hidden')));
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-in').forEach((el) => observer.observe(el));

  updateCountdown();
  setInterval(updateCountdown, 1000);
  renderWishes();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (window.lightbox) {
    lightbox.option({ resizeDuration: 200, wrapAround: true, fadeDuration: 200, imageFadeDuration: 200, showImageNumberLabel: false });
  }
})();
