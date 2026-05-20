(function () {
  var siteCtx = window.__SITE__ || {};
  var apiBase = siteCtx.apiBase || '/api';
  var slug = siteCtx.slug;
  var hasCover = !!siteCtx.hasCover;
  var allWishes = Array.isArray(window.__WISHES__) ? window.__WISHES__.slice() : [];

  function g(id) { return document.getElementById(id); }

  function showToast(msg) {
    var t = g('t21-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  function postJson(path, body) {
    return fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        return data;
      });
    });
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  /* ── Particles ───────────────────────── */
  function createParticles() {
    var container = g('t21-particles');
    if (!container) return;
    for (var i = 0; i < 20; i++) {
      var p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDelay = Math.random() * 8 + 's';
      p.style.animationDuration = (6 + Math.random() * 6) + 's';
      container.appendChild(p);
    }
  }

  /* ── Petals ──────────────────────────── */
  function createPetals() {
    var container = g('t21-petals');
    if (!container) return;
    for (var i = 0; i < 10; i++) {
      var p = document.createElement('div');
      p.className = 'petal';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = Math.random() * 20 + '%';
      p.style.animationDelay = Math.random() * 12 + 's';
      p.style.animationDuration = (10 + Math.random() * 8) + 's';
      p.style.transform = 'scale(' + (0.5 + Math.random() * 0.8) + ')';
      container.appendChild(p);
    }
  }

  /* ── Scroll reveal + gold line ───────── */
  function observeSections() {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
        }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal-section, .gold-line').forEach(function (el) {
      obs.observe(el);
    });
  }

  /* ── Countdown (bonus — element ids cd-days etc) ── */
  function parseTargetDate() {
    var raw = siteCtx.weddingDate;
    if (!raw) return new Date();
    var d = new Date(String(raw).replace(' ', 'T'));
    return isNaN(d.getTime()) ? new Date() : d;
  }
  function startCountdown() {
    var elD = g('cd-days'), elH = g('cd-hours'), elM = g('cd-mins'), elS = g('cd-secs');
    if (!elD && !elH && !elM && !elS) return;
    var target = parseTargetDate();
    function update() {
      var diff = Math.max(0, target - Date.now());
      var d = Math.floor(diff / 86400000);
      var h = Math.floor((diff % 86400000) / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      if (elD) elD.textContent = String(d).padStart(2, '0');
      if (elH) elH.textContent = String(h).padStart(2, '0');
      if (elM) elM.textContent = String(m).padStart(2, '0');
      if (elS) elS.textContent = String(s).padStart(2, '0');
    }
    update();
    setInterval(update, 1000);
  }

  /* ── Envelope open ───────────────────── */
  function openEnvelope() {
    var flap = g('t21-flap');
    var seal = g('t21-seal');
    var glow = g('t21-glow');
    var card = g('t21-inv-card');
    var btn  = g('open-btn');
    if (flap) flap.classList.add('open');
    if (seal) seal.classList.add('hide');
    if (glow) glow.classList.add('show');
    if (card) card.classList.add('reveal');
    if (btn)  btn.style.opacity = '0';
    setTimeout(function () {
      var cover = g('cover');
      var main  = g('main');
      if (cover) cover.classList.add('done');
      if (main)  {
        main.classList.remove('t21-main--hidden');
      }
      createPetals();
      observeSections();
      startCountdown();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 1500);
  }

  /* ── Init without cover ──────────────── */
  function initWithoutCover() {
    var main = g('main');
    if (main) main.classList.remove('t21-main--hidden');
    createPetals();
    observeSections();
    startCountdown();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  if (hasCover) {
    createParticles();
    var btn = g('open-btn');
    if (btn) btn.addEventListener('click', openEnvelope);
  } else {
    initWithoutCover();
  }

  /* ── RSVP ────────────────────────────── */
  var rsvpForm = g('rsvpForm');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var submitBtn = g('rsvpSubmitBtn');
      var msgOk    = g('rsvp-msg');
      var nameEl   = g('rsvpName');
      var phoneEl  = g('rsvpPhone');
      var attendEl = document.querySelector('input[name="attend"]:checked');
      var guestsEl = g('rsvpGuests');
      var notesEl  = g('rsvpMsg');

      if (!slug) {
        showToast('Pratinjau: RSVP tidak dikirim.');
        if (msgOk) { msgOk.classList.remove('hidden'); setTimeout(function () { msgOk.classList.add('hidden'); }, 4000); }
        return;
      }

      var orig = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengirim…'; }

      postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
        guest_name:   nameEl  ? String(nameEl.value).trim() : '',
        guest_phone:  phoneEl && String(phoneEl.value).trim() ? String(phoneEl.value).trim().slice(0, 40) : null,
        attendance:   attendEl && attendEl.value === 'no' ? 'no' : 'yes',
        guests_count: guestsEl ? Math.min(20, Math.max(1, parseInt(String(guestsEl.value), 10) || 1)) : 1,
        notes:        notesEl  && String(notesEl.value).trim() ? String(notesEl.value).trim() : null,
      }).then(function () {
        showToast('RSVP terkirim. Terima kasih!');
        rsvpForm.reset();
        if (guestsEl) guestsEl.value = '1';
        var yes = g('attendYes'); if (yes) yes.checked = true;
        if (msgOk) { msgOk.classList.remove('hidden'); setTimeout(function () { msgOk.classList.add('hidden'); }, 4000); }
      }).catch(function (err) {
        showToast(err.message || 'Gagal mengirim RSVP');
      }).finally(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = orig || 'Kirim RSVP'; }
      });
    });
  }

  /* ── Wishes ──────────────────────────── */
  function renderWishes() {
    var list = g('wishesList');
    if (!list) return;
    list.innerHTML = '';
    var sorted = allWishes.slice().sort(function (a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    if (!sorted.length) {
      var p = document.createElement('p');
      p.id = 'noWishes';
      p.className = 'text-center text-sm italic';
      p.style.color = 'var(--taupe)';
      p.textContent = 'Jadilah yang pertama meninggalkan ucapan hangat.';
      list.appendChild(p);
    } else {
      sorted.forEach(function (w) {
        var div = document.createElement('div');
        div.className = 't21-card p-4 rounded-2xl t21-wish-card';
        div.innerHTML =
          (w.message ? '<p class="text-sm italic" style="color:var(--brown)">&ldquo;' + escHtml(w.message) + '&rdquo;</p>' : '') +
          '<p class="font-sans-alt text-xs mt-1" style="color:var(--taupe)">&mdash; ' + escHtml(w.guest_name || '') + '</p>';
        list.appendChild(div);
      });
    }
  }

  var wishForm = g('wishForm');
  if (wishForm) {
    renderWishes();
    wishForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!slug) { showToast('Pratinjau: ucapan tidak dikirim.'); return; }
      var btn    = g('wishBtn');
      var nameEl = g('wishName');
      var msgEl  = g('wishMsg');
      if (btn) btn.disabled = true;
      postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', {
        guest_name: nameEl ? String(nameEl.value).trim() : '',
        message:    msgEl  ? String(msgEl.value).trim()  : '',
      }).then(function (data) {
        if (data && data.wish) allWishes.unshift(data.wish);
        renderWishes();
        showToast('Ucapan terkirim.');
        wishForm.reset();
      }).catch(function (err) {
        showToast(err.message || 'Gagal mengirim ucapan');
      }).finally(function () {
        if (btn) btn.disabled = false;
      });
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
})();
