(function () {
  'use strict';
  var siteCtx = window.__SITE__ || {};
  var apiBase = siteCtx.apiBase || '';
  var slug = siteCtx.slug || '';
  var hasCover = siteCtx.hasCover !== 0;
  var allWishes = window.__WISHES__ || [];

  function g(id) { return document.getElementById(id); }

  function showToast(msg) {
    var t = g('t17-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2500);
  }

  function postJson(path, body) {
    return fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).catch(function () { return { error: 'network' }; });
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Particles ─────────────────────── */
  function createParticles() {
    var container = g('t17-particles-bg');
    if (!container) return;
    for (var i = 0; i < 20; i++) {
      var p = document.createElement('div');
      p.className = 't17-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = (60 + Math.random() * 40) + '%';
      var sz = (2 + Math.random() * 3) + 'px';
      p.style.width = sz; p.style.height = sz;
      p.style.background = ['#d4a574','#e8b4b8','#b5c5a3','#f4c9c0'][Math.floor(Math.random() * 4)];
      p.style.animationDuration = (5 + Math.random() * 10) + 's';
      p.style.animationDelay = (Math.random() * 5) + 's';
      container.appendChild(p);
    }
  }

  /* ── Petals ────────────────────────── */
  function createPetals() {
    var container = g('t17-particles-bg');
    if (!container) return;
    for (var i = 0; i < 8; i++) {
      var p = document.createElement('div');
      p.className = 't17-petal';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = '-20px';
      p.style.background = ['#e8b4b8','#f4c9c0','#fce4ec'][Math.floor(Math.random() * 3)];
      p.style.animationDuration = (8 + Math.random() * 8) + 's';
      p.style.animationDelay = (Math.random() * 10) + 's';
      container.appendChild(p);
    }
  }

  /* ── Butterflies ───────────────────── */
  function createButterflies() {
    var container = g('t17-particles-bg');
    if (!container) return;
    var colors = ['#e8b4b8','#d4a574','#b5c5a3'];
    for (var i = 0; i < 3; i++) {
      var b = document.createElement('div');
      b.className = 't17-butterfly';
      b.style.left = (20 + Math.random() * 60) + '%';
      b.style.top = (20 + Math.random() * 60) + '%';
      b.style.animationDelay = (i * 3) + 's';
      b.innerHTML = '<svg width="20" height="14" viewBox="0 0 20 14" fill="' + colors[i] + '"><path d="M10 7 C8 2 2 0 0 5 C2 10 8 9 10 7Z"/><path d="M10 7 C12 2 18 0 20 5 C18 10 12 9 10 7Z"/></svg>';
      container.appendChild(b);
    }
  }

  /* ── Scroll reveal ─────────────────── */
  function observeSections() {
    var sections = document.querySelectorAll('.t17-reveal-section');
    if (!sections.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('t17-visible'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    sections.forEach(function (s, i) {
      if (i === 0) s.style.transitionDelay = '0.3s';
      obs.observe(s);
    });
  }

  /* ── Countdown ─────────────────────── */
  function startCountdown() {
    var dateStr = siteCtx.weddingDate;
    if (!dateStr) return;
    var target = new Date(dateStr).getTime();
    if (isNaN(target)) return;
    function update() {
      var diff = Math.max(0, target - Date.now());
      var d = g('cd-days'), h = g('cd-hours'), m = g('cd-mins'), s = g('cd-secs');
      if (d) d.textContent = String(Math.floor(diff / 86400000)).padStart(2, '0');
      if (h) h.textContent = String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0');
      if (m) m.textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
      if (s) s.textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    }
    update();
    setInterval(update, 1000);
  }

  /* ── Open curtain ──────────────────── */
  function openCurtain() {
    var cover = g('t17-cover');
    var main = g('main');
    var btn = g('t17-open-btn');
    if (btn) btn.style.opacity = '0';
    if (cover) cover.classList.add('t17-cover-open');
    setTimeout(function () {
      if (cover) cover.style.display = 'none';
      if (main) main.classList.remove('t17-main--hidden');
      createPetals();
      createButterflies();
      observeSections();
      startCountdown();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 1600);
  }

  /* ── Init without cover ────────────── */
  function initWithoutCover() {
    createParticles();
    observeSections();
    startCountdown();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  if (hasCover) {
    createParticles();
    var openBtn = g('t17-open-btn');
    if (openBtn) openBtn.addEventListener('click', openCurtain);
  } else {
    initWithoutCover();
  }

  /* ── RSVP ──────────────────────────── */
  var rsvpForm = g('t17-rsvp-form');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (g('t17-rsvp-name') || {}).value || '';
      var attend = (document.querySelector('input[name="t17-attend"]:checked') || {}).value || 'yes';
      var guests = parseInt((g('t17-rsvp-guests') || {}).value) || 1;
      if (!name.trim()) { showToast('Mohon isi nama Anda'); return; }
      var btn = rsvpForm.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      postJson('/public/site/' + slug + '/rsvps', { name: name, attending: attend, guests: guests }).then(function (res) {
        if (btn) btn.disabled = false;
        if (res && !res.error) { showToast('Terima kasih! RSVP telah diterima.'); rsvpForm.reset(); }
        else { showToast('Terjadi kesalahan. Coba lagi.'); }
      });
    });
  }

  /* ── Wishes ────────────────────────── */
  function renderWishes() {
    var list = g('t17-wish-list');
    if (!list) return;
    list.innerHTML = '';
    allWishes.slice().reverse().forEach(function (w) {
      var card = document.createElement('div');
      card.className = 't17-glass-card';
      card.style.cssText = 'padding:1rem;';
      card.innerHTML = '<p style="font-size:0.75rem;font-weight:600;color:#d4a574;margin-bottom:0.25rem;">' + escHtml(w.name || 'Tamu') + '</p><p style="font-size:0.875rem;color:#6b5b4a;">' + escHtml(w.message || '') + '</p>';
      list.appendChild(card);
    });
  }

  var wishForm = g('t17-wish-form');
  if (wishForm) {
    if (allWishes.length === 0) {
      fetch(apiBase + '/public/site/' + slug + '/wishes')
        .then(function (r) { return r.json(); })
        .then(function (data) { allWishes = Array.isArray(data) ? data : (data.wishes || []); renderWishes(); })
        .catch(function () {});
    } else {
      renderWishes();
    }
    wishForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (g('t17-wish-name') || {}).value || '';
      var msg = (g('t17-wish-msg') || {}).value || '';
      if (!name.trim() || !msg.trim()) { showToast('Mohon isi nama dan pesan'); return; }
      var btn = wishForm.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      postJson('/public/site/' + slug + '/wishes', { name: name, message: msg }).then(function (res) {
        if (btn) btn.disabled = false;
        if (res && !res.error) {
          allWishes.push({ name: name, message: msg });
          renderWishes();
          showToast('Ucapan telah terkirim!');
          wishForm.reset();
        } else { showToast('Terjadi kesalahan. Coba lagi.'); }
      });
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
})();
