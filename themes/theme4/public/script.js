(function () {
  const siteCtx = window.__SITE__ || {};
  const apiBase = siteCtx.apiBase || '/api';
  const allWishes = Array.isArray(window.__WISHES__) ? window.__WISHES__.slice() : [];

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
    const set = (id, v) => { const el = g(id); if (el) el.textContent = v; };
    if (diff <= 0) {
      set('cd-days', '0');
      set('cd-hours', '0');
      set('cd-mins', '0');
      set('cd-secs', '0');
      return;
    }
    set('cd-days', String(Math.floor(diff / 86400000)));
    set('cd-hours', String(Math.floor((diff % 86400000) / 3600000)));
    set('cd-mins', String(Math.floor((diff % 3600000) / 60000)));
    set('cd-secs', String(Math.floor((diff % 60000) / 1000)));
  }

  function renderWishes() {
    const list = g('wishesList');
    if (!list) return;
    list.innerHTML = '';
    const sorted = allWishes.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    sorted.forEach((w) => {
      const div = document.createElement('div');
      div.className = 'wish-card';
      div.innerHTML = `<p class="font-serif-display text-sm mb-1" style="color:var(--secondary);">${escHtml(w.guest_name)}</p><p class="text-sm" style="color:rgba(245,230,216,.7);">${escHtml(w.message)}</p>`;
      list.appendChild(div);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
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

  const mobileToggle = g('mobileToggle');
  const mobileMenu = g('mobileMenu');
  const mobileClose = g('mobileClose');
  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => mobileMenu.classList.add('open'));
  }
  if (mobileClose && mobileMenu) {
    mobileClose.addEventListener('click', () => mobileMenu.classList.remove('open'));
  }
  document.querySelectorAll('.mob-link').forEach((a) => {
    a.addEventListener('click', () => { if (mobileMenu) mobileMenu.classList.remove('open'); });
  });

  const rsvpForm = g('rsvpForm');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = g('rsvpBtn');
      const status = g('rsvpStatus');
      const slug = siteCtx.slug;
      if (!slug) {
        if (status) { status.textContent = 'Missing site slug'; status.classList.remove('hidden'); }
        return;
      }
      const orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      try {
        await postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
          guest_name: g('rsvpName').value.trim(),
          guest_phone: g('rsvpPhone') && g('rsvpPhone').value.trim() ? g('rsvpPhone').value.trim().slice(0, 40) : null,
          attendance: g('rsvpAttend').value,
          guests_count: parseInt(g('rsvpGuests').value, 10) || 1,
          notes: g('rsvpNotes').value.trim() || null,
        });
        if (status) {
          status.textContent = 'Thank you for your RSVP!';
          status.classList.remove('hidden');
        }
        rsvpForm.reset();
      } catch (err) {
        if (status) {
          status.textContent = 'Failed: ' + err.message;
          status.classList.remove('hidden');
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = orig || 'Send RSVP'; }
      }
    });
  }

  const wishForm = g('wishForm');
  if (wishForm) {
    wishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const slug = siteCtx.slug;
      if (!slug) return;
      const btn = g('wishBtn');
      const st = g('wishStatus');
      if (btn) btn.disabled = true;
      try {
        const payload = {
          guest_name: g('wishName').value.trim(),
          message: g('wishMsg').value.trim(),
        };
        const { wish } = await postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', payload);
        allWishes.push(wish || { ...payload, created_at: new Date().toISOString() });
        renderWishes();
        wishForm.reset();
        if (st) { st.textContent = 'Your wish has been sent!'; st.classList.remove('hidden'); }
      } catch (err) {
        if (st) { st.textContent = err.message; st.classList.remove('hidden'); }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  document.querySelectorAll('.copy-acct').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const val = btn.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(val);
        const toast = g('copy-toast');
        if (toast) { toast.classList.remove('hidden'); setTimeout(() => toast.classList.add('hidden'), 2000); }
      } catch (_) {}
    });
  });

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));

  updateCountdown();
  setInterval(updateCountdown, 1000);
  renderWishes();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (window.lightbox) {
    lightbox.option({ resizeDuration: 200, wrapAround: true, fadeDuration: 200, imageFadeDuration: 200, showImageNumberLabel: false });
  }
})();
