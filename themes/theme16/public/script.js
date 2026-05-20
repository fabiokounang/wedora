(function () {
  const siteCtx = window.__SITE__ || {};
  const apiBase = siteCtx.apiBase || '/api';
  const slug = siteCtx.slug;
  const hasCover = !!siteCtx.hasCover;
  let allWishes = Array.isArray(window.__WISHES__) ? window.__WISHES__.slice() : [];

  function g(id) {
    return document.getElementById(id);
  }

  function showToast(msg) {
    const t = g('t16-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () {
      t.classList.remove('show');
    }, 3200);
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
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function createPetals() {
    const container = g('petals-container');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 15; i++) {
      const petal = document.createElement('div');
      petal.className = 'petal';
      petal.style.left = Math.random() * 100 + '%';
      petal.style.animationDuration = 8 + Math.random() * 6 + 's';
      petal.style.animationDelay = Math.random() * 10 + 's';
      container.appendChild(petal);
    }
  }

  function createParticles() {
    const container = g('particles-container');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = Math.random() * 100 + '%';
      p.style.animationDelay = Math.random() * 5 + 's';
      container.appendChild(p);
    }
  }

  function observeSections() {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) entry.target.classList.add('section-visible');
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll('[data-section]').forEach(function (s) {
      observer.observe(s);
    });
  }

  function parseTargetDate() {
    const raw = siteCtx.weddingDate;
    if (!raw) return new Date();
    const s = String(raw).replace(' ', 'T');
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  let countdownTimer = null;
  function startCountdown() {
    const target = parseTargetDate();
    function update() {
      const now = Date.now();
      const diff = Math.max(0, target - now);
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const elD = g('cd-days');
      const elH = g('cd-hours');
      const elM = g('cd-mins');
      const elS = g('cd-secs');
      if (elD) elD.textContent = String(d).padStart(2, '0');
      if (elH) elH.textContent = String(h).padStart(2, '0');
      if (elM) elM.textContent = String(m).padStart(2, '0');
      if (elS) elS.textContent = String(s).padStart(2, '0');
    }
    update();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(update, 1000);
  }

  function openInvitation() {
    const cover = g('cover');
    const main = g('main');
    if (cover) {
      cover.style.transition = 'opacity 1s ease, transform 1s ease';
      cover.style.opacity = '0';
      cover.style.transform = 'scale(1.05)';
    }
    setTimeout(function () {
      if (cover) cover.style.display = 'none';
      if (main) {
        main.classList.remove('t16-main--hidden');
        main.style.display = 'block';
      }
      document.body.classList.remove('overflow-hidden');
      createPetals();
      createParticles();
      observeSections();
      if (g('cd-days')) startCountdown();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 800);
  }

  function initWithoutCover() {
    const main = g('main');
    if (main) {
      main.classList.remove('t16-main--hidden');
      main.style.display = 'block';
    }
    document.body.classList.remove('overflow-hidden');
    createPetals();
    createParticles();
    observeSections();
    if (g('cd-days')) startCountdown();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  if (hasCover) {
    const btn = g('open-btn');
    if (btn) btn.addEventListener('click', openInvitation);
  } else {
    initWithoutCover();
  }

  const rsvpForm = g('rsvpForm');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const submitBtn = g('rsvpSubmitBtn');
      const msgOk = g('rsvp-msg');
      const nameEl = g('rsvpName');
      const phoneEl = g('rsvpPhone');
      const attendEl = document.querySelector('input[name="attend"]:checked');
      const guestsEl = g('rsvpGuests');
      const notesEl = g('rsvpMsg');

      if (!slug) {
        showToast('Pratinjau: RSVP tidak dikirim.');
        if (msgOk) {
          msgOk.classList.remove('hidden');
          setTimeout(function () {
            msgOk.classList.add('hidden');
          }, 4000);
        }
        return;
      }

      const orig = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Mengirim…';
      }

      postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
        guest_name: nameEl ? String(nameEl.value).trim() : '',
        guest_phone: phoneEl && String(phoneEl.value).trim() ? String(phoneEl.value).trim().slice(0, 40) : null,
        attendance: attendEl && attendEl.value === 'no' ? 'no' : 'yes',
        guests_count: guestsEl ? Math.min(20, Math.max(1, parseInt(String(guestsEl.value), 10) || 1)) : 1,
        notes: notesEl && String(notesEl.value).trim() ? String(notesEl.value).trim() : null,
      })
        .then(function () {
          showToast('RSVP terkirim. Terima kasih!');
          rsvpForm.reset();
          if (guestsEl) guestsEl.value = '1';
          const yes = g('attendYes');
          if (yes) yes.checked = true;
          if (msgOk) {
            msgOk.classList.remove('hidden');
            setTimeout(function () {
              msgOk.classList.add('hidden');
            }, 4000);
          }
        })
        .catch(function (err) {
          showToast(err.message || 'Gagal mengirim RSVP');
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = orig || 'Kirim RSVP';
          }
        });
    });
  }

  function renderWishes() {
    const list = g('wishesList');
    if (!list) return;
    list.innerHTML = '';
    const sorted = allWishes.slice().sort(function (a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    if (!sorted.length) {
      const p = document.createElement('p');
      p.id = 'noWishes';
      p.className = 'text-center text-sm text-[#8b7355] italic';
      p.textContent = 'Jadilah yang pertama meninggalkan ucapan hangat.';
      list.appendChild(p);
    } else {
      sorted.forEach(function (w) {
        const div = document.createElement('div');
        div.className = 'glass-card p-4 t16-wish-card';
        div.innerHTML =
          (w.message
            ? '<p class="text-sm text-[#5a4a3a]">&ldquo;' + escHtml(w.message) + '&rdquo;</p>'
            : '') +
          '<p class="text-xs text-[#8b7355] mt-1">&mdash; ' +
          escHtml(w.guest_name || '') +
          '</p>';
        list.appendChild(div);
      });
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  const wishForm = g('wishForm');
  if (wishForm) {
    renderWishes();
    wishForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!slug) {
        showToast('Pratinjau: ucapan tidak dikirim.');
        return;
      }
      const btn = g('wishBtn');
      const nameEl = g('wishName');
      const msgEl = g('wishMsg');
      if (btn) btn.disabled = true;
      postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', {
        guest_name: nameEl ? String(nameEl.value).trim() : '',
        message: msgEl ? String(msgEl.value).trim() : '',
      })
        .then(function (data) {
          if (data && data.wish) allWishes.unshift(data.wish);
          renderWishes();
          showToast('Ucapan terkirim.');
          wishForm.reset();
        })
        .catch(function (err) {
          showToast(err.message || 'Gagal mengirim ucapan');
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
})();
