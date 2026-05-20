(function () {
  'use strict';
  var siteCtx = window.__SITE__ || {};
  var apiBase = siteCtx.apiBase || '';
  var slug = siteCtx.slug || '';
  var hasCover = siteCtx.hasCover !== 0;
  var allWishes = window.__WISHES__ || [];

  function g(id) { return document.getElementById(id); }
  function showToast(msg) {
    var t = g('t20-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2500);
  }
  function postJson(path, body) {
    return fetch(apiBase + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).catch(function () { return { error: 'network' }; });
  }
  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── Ember canvas ── */
  var emberAnimId;
  function startEmbers() {
    var canvas = g('t20-ember-canvas'); if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    window.addEventListener('resize', function () { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
    var embers = [];
    for (var i = 0; i < 60; i++) {
      embers.push({
        x: Math.random() * canvas.width, y: canvas.height + Math.random() * 200,
        r: 1 + Math.random() * 2.5, vy: -(0.5 + Math.random() * 1.5), vx: (Math.random() - 0.5) * 0.8,
        life: Math.random(), decay: 0.004 + Math.random() * 0.006,
        color: ['#f4c860','#e87030','#c43010','#ff8040'][Math.floor(Math.random() * 4)]
      });
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      embers.forEach(function (e) {
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = e.color; ctx.globalAlpha = e.life; ctx.fill();
        e.x += e.vx; e.y += e.vy; e.life -= e.decay;
        if (e.life <= 0) {
          e.x = Math.random() * canvas.width; e.y = canvas.height + 10;
          e.life = 0.6 + Math.random() * 0.4; e.r = 1 + Math.random() * 2.5;
        }
      });
      ctx.globalAlpha = 1;
      emberAnimId = requestAnimationFrame(draw);
    }
    draw();
  }
  function stopEmbers() { if (emberAnimId) cancelAnimationFrame(emberAnimId); }

  /* ── Scroll reveal ── */
  function observeSections() {
    var sections = document.querySelectorAll('.t20-reveal');
    if (!sections.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('t20-vis'); obs.unobserve(e.target); } });
    }, { threshold: 0.12 });
    sections.forEach(function (s) { obs.observe(s); });
  }

  /* ── Countdown ── */
  function startCountdown() {
    var dateStr = siteCtx.weddingDate; if (!dateStr) return;
    var target = new Date(dateStr).getTime(); if (isNaN(target)) return;
    function update() {
      var diff = Math.max(0, target - Date.now());
      var d = g('cd-days'), h = g('cd-hours'), m = g('cd-mins'), s = g('cd-secs');
      if (d) d.textContent = String(Math.floor(diff/86400000)).padStart(2,'0');
      if (h) h.textContent = String(Math.floor((diff%86400000)/3600000)).padStart(2,'0');
      if (m) m.textContent = String(Math.floor((diff%3600000)/60000)).padStart(2,'0');
      if (s) s.textContent = String(Math.floor((diff%60000)/1000)).padStart(2,'0');
    }
    update(); setInterval(update, 1000);
  }

  /* ── Open cover ── */
  function openCover() {
    var cover = g('t20-cover');
    var main = g('main');
    if (cover) { cover.style.transition = 'opacity 1s ease'; cover.style.opacity = '0'; }
    stopEmbers();
    setTimeout(function () {
      if (cover) cover.style.display = 'none';
      if (main) main.style.display = '';
      observeSections(); startCountdown();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 1050);
  }

  if (hasCover) {
    startEmbers();
    var openBtn = g('t20-open-btn');
    if (openBtn) openBtn.addEventListener('click', openCover);
  } else {
    observeSections(); startCountdown();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  /* ── RSVP ── */
  var rsvpForm = g('t20-rsvp-form');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (g('t20-rsvp-name') || {}).value || '';
      var attend = (document.querySelector('input[name="t20-attend"]:checked') || {}).value || 'yes';
      var guests = parseInt((g('t20-rsvp-guests') || {}).value) || 1;
      if (!name.trim()) { showToast('Mohon isi nama Anda'); return; }
      var btn = rsvpForm.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
      postJson('/public/site/' + slug + '/rsvps', { name: name, attending: attend, guests: guests }).then(function (res) {
        if (btn) btn.disabled = false;
        if (res && !res.error) { showToast('Terima kasih! RSVP telah diterima.'); rsvpForm.reset(); }
        else showToast('Terjadi kesalahan. Coba lagi.');
      });
    });
  }

  /* ── Wishes ── */
  function renderWishes() {
    var list = g('t20-wish-list'); if (!list) return;
    list.innerHTML = '';
    allWishes.slice().reverse().forEach(function (w) {
      var card = document.createElement('div');
      card.className = 't20-flame-card';
      card.style.cssText = 'padding:1rem;text-align:left;';
      card.innerHTML = '<p style="font-size:0.65rem;letter-spacing:0.2em;color:#e87030;margin-bottom:0.25rem;">' + escHtml(w.name || 'Tamu') + '</p><p style="font-size:0.875rem;color:#a08060;">' + escHtml(w.message || '') + '</p>';
      list.appendChild(card);
    });
  }
  var wishForm = g('t20-wish-form');
  if (wishForm) {
    if (!allWishes.length) {
      fetch(apiBase + '/public/site/' + slug + '/wishes').then(function (r) { return r.json(); })
        .then(function (data) { allWishes = Array.isArray(data) ? data : (data.wishes || []); renderWishes(); }).catch(function () {});
    } else renderWishes();
    wishForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (g('t20-wish-name') || {}).value || '';
      var msg = (g('t20-wish-msg') || {}).value || '';
      if (!name.trim() || !msg.trim()) { showToast('Mohon isi nama dan pesan'); return; }
      var btn = wishForm.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
      postJson('/public/site/' + slug + '/wishes', { name: name, message: msg }).then(function (res) {
        if (btn) btn.disabled = false;
        if (res && !res.error) { allWishes.push({ name: name, message: msg }); renderWishes(); showToast('Ucapan telah terkirim!'); wishForm.reset(); }
        else showToast('Terjadi kesalahan. Coba lagi.');
      });
    });
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
})();
