(function () {
  'use strict';
  var siteCtx = window.__SITE__ || {};
  var apiBase = siteCtx.apiBase || '';
  var slug = siteCtx.slug || '';
  var hasCover = siteCtx.hasCover !== 0;
  var allWishes = window.__WISHES__ || [];

  function g(id) { return document.getElementById(id); }
  function showToast(msg) {
    var t = g('t19-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2500);
  }
  function postJson(path, body) {
    return fetch(apiBase + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).catch(function () { return { error: 'network' }; });
  }
  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── Cover particles ── */
  function spawnParticles() {
    var wrap = g('t19-particles');
    if (!wrap) return;
    var colors = ['#c9a87a','#e8d0a8','#f4e6cc','#ddd0b8'];
    for (var i = 0; i < 18; i++) {
      var p = document.createElement('div');
      p.className = 't19-particle';
      var sz = (3 + Math.random() * 4) + 'px';
      p.style.cssText = 'left:' + (Math.random()*100) + '%;bottom:0;width:' + sz + ';height:' + sz + ';background:' + colors[Math.floor(Math.random()*colors.length)] + ';animation-duration:' + (6+Math.random()*8) + 's;animation-delay:' + (Math.random()*5) + 's;';
      wrap.appendChild(p);
    }
  }

  /* ── Scroll reveal ── */
  function observeSections() {
    var sections = document.querySelectorAll('.t19-reveal');
    if (!sections.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('t19-vis'); obs.unobserve(e.target); } });
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

  /* ── Gallery drag ── */
  function initGallery() {
    var track = g('t19-gallery'); if (!track) return;
    var isDragging = false, startX = 0, scrollLeft = 0;
    track.addEventListener('mousedown', function (e) { isDragging = true; startX = e.pageX - track.offsetLeft; scrollLeft = track.scrollLeft; });
    document.addEventListener('mouseup', function () { isDragging = false; });
    track.addEventListener('mousemove', function (e) { if (!isDragging) return; e.preventDefault(); var x = e.pageX - track.offsetLeft; track.scrollLeft = scrollLeft - (x - startX); });
    track.addEventListener('touchstart', function (e) { startX = e.touches[0].pageX - track.offsetLeft; scrollLeft = track.scrollLeft; }, { passive: true });
    track.addEventListener('touchmove', function (e) { var x = e.touches[0].pageX - track.offsetLeft; track.scrollLeft = scrollLeft - (x - startX); }, { passive: true });
  }

  /* ── Open cover ── */
  function openCover() {
    var cover = g('t19-cover');
    var main = g('main');
    if (cover) { cover.style.transition = 'opacity 0.8s ease'; cover.style.opacity = '0'; }
    setTimeout(function () {
      if (cover) cover.style.display = 'none';
      if (main) { main.style.display = ''; setTimeout(function () { main.style.opacity = '1'; main.style.transition = 'opacity 0.5s ease'; }, 50); }
      observeSections(); startCountdown(); initGallery();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 850);
  }

  if (hasCover) {
    spawnParticles();
    var openBtn = g('t19-open-btn');
    if (openBtn) openBtn.addEventListener('click', openCover);
  } else {
    observeSections(); startCountdown(); initGallery();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  /* ── RSVP ── */
  var rsvpForm = g('t19-rsvp-form');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (g('t19-rsvp-name') || {}).value || '';
      var attend = (document.querySelector('input[name="t19-attend"]:checked') || {}).value || 'yes';
      var guests = parseInt((g('t19-rsvp-guests') || {}).value) || 1;
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
    var list = g('t19-wish-list'); if (!list) return;
    list.innerHTML = '';
    allWishes.slice().reverse().forEach(function (w) {
      var card = document.createElement('div');
      card.className = 't19-glass-card';
      card.style.cssText = 'padding:1rem;text-align:left;';
      card.innerHTML = '<p style="font-size:0.7rem;letter-spacing:0.1em;color:#c9a87a;margin-bottom:0.25rem;">' + escHtml(w.name || 'Tamu') + '</p><p style="font-size:0.875rem;color:#7a6a54;">' + escHtml(w.message || '') + '</p>';
      list.appendChild(card);
    });
  }
  var wishForm = g('t19-wish-form');
  if (wishForm) {
    if (!allWishes.length) {
      fetch(apiBase + '/public/site/' + slug + '/wishes').then(function (r) { return r.json(); })
        .then(function (data) { allWishes = Array.isArray(data) ? data : (data.wishes || []); renderWishes(); }).catch(function () {});
    } else renderWishes();
    wishForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (g('t19-wish-name') || {}).value || '';
      var msg = (g('t19-wish-msg') || {}).value || '';
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
