(function () {
  const siteCtx = window.__SITE__ || {};
  const apiBase = siteCtx.apiBase || '/api';

  const allWishes = Array.isArray(window.__WISHES__) ? window.__WISHES__.slice() : [];

  function g(id) { return document.getElementById(id); }

  function showToast(msg) {
    const t = g('toast'); if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  function updateCountdown() {
    const iso = siteCtx.weddingDate;
    if (!iso) return;
    const wedding = new Date(iso);
    const diff = wedding - new Date();
    const set = (id, v) => { const el = g(id); if (el) el.textContent = v; };
    if (diff <= 0) { set('cdDays',0); set('cdHours',0); set('cdMins',0); set('cdSecs',0); return; }
    set('cdDays', Math.floor(diff / 86400000));
    set('cdHours', Math.floor((diff % 86400000) / 3600000));
    set('cdMins', Math.floor((diff % 3600000) / 60000));
    set('cdSecs', Math.floor((diff % 60000) / 1000));
  }

  function revealOnScroll() {
    document.querySelectorAll('.reveal:not(.visible)').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.88) el.classList.add('visible');
    });
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function renderWishes() {
    const list = g('wishesList');
    const noW = g('noWishes');
    if (!list) return;
    if (allWishes.length === 0) {
      list.innerHTML = '';
      if (noW) noW.style.display = 'block';
      return;
    }
    if (noW) noW.style.display = 'none';
    const sorted = allWishes.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    list.innerHTML = '';
    sorted.forEach((w) => {
      const div = document.createElement('div');
      div.className = 'wish-card rounded-lg p-5';
      div.innerHTML = `<p class="wish-note font-serif-display text-base" style="color:rgba(212,197,169,0.8);font-style:italic;line-height:1.7;">"${escHtml(w.message)}"</p><p class="wish-name mt-3 text-xs tracking-widest uppercase" style="color:rgba(196,168,116,0.4);">- ${escHtml(w.guest_name)}</p>`;
      list.appendChild(div);
    });
  }

  function setActiveNavByHash(hash) {
    document.querySelectorAll('#mainNav .nav-link').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === hash);
    });
  }

  function animateNavTap(link) {
    link.classList.remove('nav-link-clicked');
    void link.offsetWidth;
    link.classList.add('nav-link-clicked');
  }

  const appEl = g('app');

  function handleNavClick(event) {
    const link = event.currentTarget;
    const hash = link.getAttribute('href');
    if (!hash || !hash.startsWith('#')) return;
    const target = document.querySelector(hash);
    if (!target) return;
    event.preventDefault();
    const navH = g('mainNav').offsetHeight;
    const top = target.offsetTop - navH + 4;
    appEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    setActiveNavByHash(hash);
    animateNavTap(link);
    history.replaceState(null, '', hash);
    const mm = g('mobileMenu'); if (mm) mm.classList.add('hidden');
  }

  const mobileBtn = g('mobileMenuBtn');
  if (mobileBtn) mobileBtn.addEventListener('click', () => g('mobileMenu').classList.toggle('hidden'));

  document.querySelectorAll("#mainNav a[href^='#'], #mobileMenu a[href^='#']").forEach((a) => {
    a.addEventListener('click', handleNavClick);
  });

  appEl.addEventListener('scroll', () => {
    revealOnScroll();
    let current = '';
    document.querySelectorAll('section').forEach((s) => {
      if (appEl.scrollTop >= s.offsetTop - 120) current = s.id;
    });
    if (current) setActiveNavByHash('#' + current);
  });

  async function postJson(path, body) {
    const res = await fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  const rsvpForm = g('rsvpForm');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = g('rsvpBtn');
      const orig = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        const attendance = document.querySelector('input[name="attendance"]:checked');
        const slug = siteCtx.slug;
        if (!slug) throw new Error('missing site slug');
        await postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
          guest_name: g('rsvpName').value.trim(),
          guest_phone: g('rsvpPhone') && g('rsvpPhone').value.trim() ? g('rsvpPhone').value.trim().slice(0, 40) : null,
          attendance: attendance ? attendance.value : 'yes',
          guests_count: parseInt(g('rsvpGuests').value, 10) || 1,
          notes: g('rsvpNotes').value.trim() || null,
        });
        showToast('Thank you! Your RSVP has been received');
        rsvpForm.reset();
      } catch (err) {
        showToast('Failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  }

  const wishForm = g('wishForm');
  if (wishForm) {
    wishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = g('wishBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        const slug = siteCtx.slug;
        if (!slug) throw new Error('missing site slug');
        const payload = {
          guest_name: g('wishName').value.trim(),
          message: g('wishText').value.trim(),
        };
        const { wish } = await postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', payload);
        allWishes.push(wish || { ...payload, created_at: new Date().toISOString() });
        renderWishes();
        wishForm.reset();
        showToast('Your wish has been sent');
      } catch (err) {
        showToast('Failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send';
      }
    });
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
  setTimeout(revealOnScroll, 300);
  setActiveNavByHash('#hero');
  renderWishes();

  if (window.lightbox) {
    lightbox.option({
      resizeDuration: 200,
      wrapAround: true,
      fadeDuration: 200,
      imageFadeDuration: 200,
      showImageNumberLabel: false,
    });
  }
})();
