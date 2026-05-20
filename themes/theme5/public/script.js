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

  function showToast(msg) {
    const t = g('toast');
    const tx = g('toast-text');
    if (tx) tx.textContent = msg;
    if (t) {
      t.classList.remove('hidden');
      setTimeout(() => t.classList.add('hidden'), 3000);
    }
  }

  function updateCountdown() {
    const iso = siteCtx.weddingDate;
    if (!iso) return;
    const target = new Date(String(iso).replace(' ', 'T'));
    const now = new Date();
    const diff = Math.max(0, target - now);
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const set = (id, v) => { const el = g(id); if (el) el.textContent = v; };
    set('cd-days', pad(d));
    set('cd-hours', pad(h));
    set('cd-mins', pad(m));
    set('cd-secs', pad(s));
  }

  function renderWishes() {
    const list = g('wishes-list');
    const empty = g('wishes-empty');
    if (!list) return;
    list.innerHTML = '';
    const sorted = allWishes.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    sorted.forEach((w) => {
      const card = document.createElement('div');
      card.className = 'wish-card rounded-xl p-5';
      card.innerHTML = `<p class="text-champagne/80 text-lg italic">"${escHtml(w.message)}"</p><p class="text-gold/50 font-ui text-xs tracking-wider mt-3 uppercase">— ${escHtml(w.guest_name)}</p>`;
      list.appendChild(card);
    });
    if (empty) empty.classList.toggle('hidden', sorted.length > 0);
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

  (function createParticles() {
    const container = g('particles');
    if (!container) return;
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = 50 + Math.random() * 50 + '%';
      p.style.animationDuration = 8 + Math.random() * 12 + 's';
      p.style.animationDelay = Math.random() * 10 + 's';
      const sz = 2 + Math.random() * 3;
      p.style.width = sz + 'px';
      p.style.height = sz + 'px';
      container.appendChild(p);
    }
  })();

  const wrapper = g('app-wrapper');
  const mainNav = g('main-nav');
  if (wrapper && mainNav) {
    wrapper.addEventListener('scroll', () => {
      mainNav.classList.toggle('scrolled', wrapper.scrollTop > 50);
    });
  }

  const mobToggle = g('mobile-toggle');
  const mobMenu = g('mobile-menu');
  if (mobToggle && mobMenu) {
    mobToggle.addEventListener('click', () => mobMenu.classList.toggle('hidden'));
  }
  if (mobMenu) {
    mobMenu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => mobMenu.classList.add('hidden'));
    });
  }

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.section-reveal, .story-card').forEach((el) => obs.observe(el));

  const rsvpForm = g('rsvp-form');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const slug = siteCtx.slug;
      if (!slug) {
        showToast('Missing site slug');
        return;
      }
      const btn = g('rsvp-btn');
      const orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      try {
        await postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
          guest_name: g('rsvp-name').value.trim(),
          guest_phone: g('rsvpPhone') && g('rsvpPhone').value.trim() ? g('rsvpPhone').value.trim().slice(0, 40) : null,
          attendance: g('rsvp-attend').value,
          guests_count: parseInt(g('rsvp-guests').value, 10) || 1,
          notes: g('rsvp-notes').value.trim() || null,
        });
        showToast('Thank you! Your response has been received.');
        rsvpForm.reset();
      } catch (err) {
        showToast(err.message || 'Something went wrong');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = orig || 'Send RSVP'; }
      }
    });
  }

  const wishForm = g('wish-form');
  if (wishForm) {
    wishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const slug = siteCtx.slug;
      if (!slug) return;
      const btn = g('wish-btn');
      if (btn) btn.disabled = true;
      try {
        const msgEl = g('wish-msg');
        const payload = {
          guest_name: g('wish-name').value.trim(),
          message: (msgEl && msgEl.value) ? msgEl.value.trim() : '',
        };
        const { wish } = await postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', payload);
        allWishes.push(wish || { ...payload, created_at: new Date().toISOString() });
        renderWishes();
        wishForm.reset();
        showToast('Your wish has been sent with love 💕');
      } catch (err) {
        showToast(err.message || 'Error');
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
        showToast('Copied');
      } catch (_) {}
    });
  });

  updateCountdown();
  setInterval(updateCountdown, 1000);
  renderWishes();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (window.lightbox) {
    lightbox.option({ resizeDuration: 200, wrapAround: true, fadeDuration: 200, imageFadeDuration: 200, showImageNumberLabel: false });
  }
})();
