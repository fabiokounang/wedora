(function () {
  'use strict';
  var siteCtx = window.__SITE__ || {};
  var apiBase = siteCtx.apiBase || '';
  var slug = siteCtx.slug || '';
  var hasCover = siteCtx.hasCover !== 0;
  var allWishes = window.__WISHES__ || [];

  function g(id) { return document.getElementById(id); }
  function showToast(msg) {
    var t = g('t18-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2500);
  }
  function postJson(path, body) {
    return fetch(apiBase + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).catch(function () { return { error: 'network' }; });
  }
  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── Scroll reveal ── */
  function observeSections() {
    var sections = document.querySelectorAll('.t18-reveal');
    if (!sections.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('t18-vis'); obs.unobserve(e.target); } });
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
      if (d) d.textContent = String(Math.floor(diff / 86400000)).padStart(2, '0');
      if (h) h.textContent = String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0');
      if (m) m.textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
      if (s) s.textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    }
    update(); setInterval(update, 1000);
  }

  /* ── Gallery drag ── */
  function initGallery() {
    var track = g('t18-gallery'); if (!track) return;
    var isDragging = false, startX = 0, scrollLeft = 0;
    track.addEventListener('mousedown', function (e) { isDragging = true; startX = e.pageX - track.offsetLeft; scrollLeft = track.scrollLeft; });
    document.addEventListener('mouseup', function () { isDragging = false; });
    track.addEventListener('mousemove', function (e) { if (!isDragging) return; e.preventDefault(); var x = e.pageX - track.offsetLeft; track.scrollLeft = scrollLeft - (x - startX); });
    track.addEventListener('touchstart', function (e) { startX = e.touches[0].pageX - track.offsetLeft; scrollLeft = track.scrollLeft; }, { passive: true });
    track.addEventListener('touchmove', function (e) { var x = e.touches[0].pageX - track.offsetLeft; track.scrollLeft = scrollLeft - (x - startX); }, { passive: true });
    track.style.overflowX = 'auto'; track.style.scrollSnapType = 'x mandatory';
    track.querySelectorAll('.t18-gallery-slide').forEach(function (s) { s.style.scrollSnapAlign = 'start'; });
  }

  /* ── Open cover ── */
  function openCover() {
    var cover = g('t18-cover');
    cover.classList.add('t18-cover-exit');
    setTimeout(function () {
      cover.style.display = 'none';
      var main = g('main');
      if (main) { main.style.display = ''; }
      observeSections();
      startCountdown();
      initGallery();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 850);
  }

  if (hasCover) {
    var openBtn = g('t18-open-btn');
    if (openBtn) openBtn.addEventListener('click', openCover);
  } else {
    observeSections(); startCountdown(); initGallery();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  /* ── RSVP ── */
  var rsvpForm = g('t18-rsvp-form');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (g('t18-rsvp-name') || {}).value || '';
      var attend = (document.querySelector('input[name="t18-attend"]:checked') || {}).value || 'yes';
      var guests = parseInt((g('t18-rsvp-guests') || {}).value) || 1;
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
    var list = g('t18-wish-list'); if (!list) return;
    list.innerHTML = '';
    allWishes.slice().reverse().forEach(function (w) {
      var card = document.createElement('div');
      card.style.cssText = 'background:#f5ede0;border-radius:0.75rem;padding:1rem;text-align:left;';
      card.innerHTML = '<p style="font-size:0.75rem;font-weight:600;color:#c9a87a;margin-bottom:0.25rem;">' + escHtml(w.name || 'Tamu') + '</p><p style="font-size:0.875rem;color:#7a6a54;">' + escHtml(w.message || '') + '</p>';
      list.appendChild(card);
    });
  }
  var wishForm = g('t18-wish-form');
  if (wishForm) {
    if (!allWishes.length) {
      fetch(apiBase + '/public/site/' + slug + '/wishes').then(function (r) { return r.json(); })
        .then(function (data) { allWishes = Array.isArray(data) ? data : (data.wishes || []); renderWishes(); }).catch(function () {});
    } else renderWishes();
    wishForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (g('t18-wish-name') || {}).value || '';
      var msg = (g('t18-wish-msg') || {}).value || '';
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
