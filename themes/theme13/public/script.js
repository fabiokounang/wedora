(function () {
  const siteCtx = window.__SITE__ || {};
  const apiBase = siteCtx.apiBase || '/api';
  const slug = siteCtx.slug;
  const hasCover = !!siteCtx.hasCover;
  const keepHeroVisible = !!siteCtx.keepHeroVisibleAfterOpen;

  function g(id) {
    return document.getElementById(id);
  }

  function showToast(msg) {
    const t = g('t13-toast');
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

  function createCoverParticles() {
    const container = g('particles-cover');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = 60 + Math.random() * 40 + '%';
      p.style.width = p.style.height = 2 + Math.random() * 4 + 'px';
      p.style.background = 'rgba(212,165,116,' + (0.3 + Math.random() * 0.4) + ')';
      p.style.animationDuration = 4 + Math.random() * 6 + 's';
      p.style.animationDelay = Math.random() * 5 + 's';
      container.appendChild(p);
    }
  }

  function createPetals() {
    const container = g('petals-container');
    if (!container) return;
    const colors = ['#f4c2c2', '#fddde6', '#f8e8e0', '#ffe4e1'];
    for (let i = 0; i < 12; i++) {
      const petal = document.createElement('div');
      petal.className = 'petal';
      petal.style.left = Math.random() * 100 + '%';
      petal.style.width = 8 + Math.random() * 12 + 'px';
      petal.style.height = 8 + Math.random() * 12 + 'px';
      petal.style.borderRadius = '50% 0 50% 50%';
      petal.style.background = colors[Math.floor(Math.random() * colors.length)];
      petal.style.animationDuration = 8 + Math.random() * 12 + 's';
      petal.style.animationDelay = Math.random() * 10 + 's';
      container.appendChild(petal);
    }
  }

  function parseTargetDate() {
    const raw = siteCtx.weddingDate;
    if (!raw) return new Date('2025-06-15T10:00:00');
    const s = String(raw).replace(' ', 'T');
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date('2025-06-15T10:00:00') : d;
  }

  let countdownTimer = null;
  function startCountdown() {
    const target = parseTargetDate();
    function update() {
      const now = new Date();
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

  function observeSections() {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll('.section-fade').forEach(function (el) {
      observer.observe(el);
    });
  }

  function openInvitation() {
    const cover = g('cover-screen');
    const flap = g('envelope-flap');
    const letter = g('envelope-letter');
    const inv = g('invitation');

    if (flap) flap.classList.add('open');
    if (letter) setTimeout(function () { letter.classList.add('rise'); }, 600);
    setTimeout(function () {
      if (cover) cover.classList.add('hide');
      if (inv) inv.style.opacity = '1';
      createPetals();
      startCountdown();
      observeSections();
    }, 1800);
  }

  function initWithoutCover() {
    const inv = g('invitation');
    if (inv) inv.style.opacity = '1';
    createPetals();
    startCountdown();
    observeSections();
  }

  if (hasCover) {
    createCoverParticles();
    const btnOpen = g('btn-open');
    if (btnOpen) {
      btnOpen.addEventListener('click', openInvitation);
    }
    if (keepHeroVisible) {
      /* cover stays in DOM; user scrolls past it — optional future behavior */
    }
  } else {
    initWithoutCover();
  }

  const rsvpForm = g('rsvp-form');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const successEl = g('rsvp-success');
      const submitBtn = g('rsvp-submit');
      const nameEl = g('rsvp-name');
      const attendEl = g('rsvp-attend');
      const msgEl = g('rsvp-msg');

      if (!slug) {
        if (successEl) {
          successEl.style.opacity = '1';
          setTimeout(function () { successEl.style.opacity = '0'; }, 3000);
        }
        return;
      }

      const orig = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '…';
      }

      postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
        guest_name: nameEl ? String(nameEl.value).trim() : '',
        guest_phone: null,
        attendance: attendEl && attendEl.value === 'no' ? 'no' : 'yes',
        guests_count: 1,
        notes: msgEl && String(msgEl.value).trim() ? String(msgEl.value).trim() : null,
      })
        .then(function () {
          showToast('RSVP terkirim. Terima kasih!');
          rsvpForm.reset();
          if (successEl) {
            successEl.style.opacity = '1';
            setTimeout(function () { successEl.style.opacity = '0'; }, 3000);
          }
        })
        .catch(function (err) {
          showToast(err.message || 'Gagal mengirim RSVP');
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = orig || 'Send RSVP';
          }
        });
    });
  }

})();
