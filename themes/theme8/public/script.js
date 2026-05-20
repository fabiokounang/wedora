(function () {
  var siteCtx = window.__SITE__ || {};
  var apiBase = siteCtx.apiBase || '/api';
  var allWishes = Array.isArray(window.__WISHES__) ? window.__WISHES__.slice() : [];

  function g(id) { return document.getElementById(id); }

  function showToast(msg) {
    var t = g('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 3500);
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  // --- Scroll-based scene reveal ---
  var app = document.getElementById('app');
  var scenes = document.querySelectorAll('.scene');
  var dots = document.querySelectorAll('.dot');

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        var sectionId = entry.target.id;
        dots.forEach(function (d) {
          d.classList.toggle('active', d.dataset.section === sectionId);
        });
      }
    });
  }, { root: app, threshold: 0.2 });

  scenes.forEach(function (s) { observer.observe(s); });

  // Dot click navigation
  dots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      var target = document.getElementById(dot.dataset.section);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // --- Wishes ---
  function renderWishes() {
    var list = g('wishesList');
    var noW = g('noWishes');
    if (!list) return;
    if (allWishes.length === 0) {
      list.innerHTML = '';
      if (noW) noW.style.display = 'block';
      return;
    }
    if (noW) noW.style.display = 'none';
    var sorted = allWishes.slice().sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    list.innerHTML = '';
    sorted.forEach(function (w) {
      var div = document.createElement('div');
      div.className = 'wish-card';
      div.innerHTML =
        '<p class="font-story text-base italic" style="color:var(--taupe);line-height:1.7">\u201C' + escHtml(w.message) + '\u201D</p>' +
        '<p class="mt-2 text-xs tracking-widest uppercase" style="color:var(--gold);opacity:.6">\u2014 ' + escHtml(w.guest_name) + '</p>';
      list.appendChild(div);
    });
  }

  // --- API helper ---
  function postJson(path, body) {
    return fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        return data;
      });
    });
  }

  // --- RSVP Form ---
  var rsvpForm = g('rsvpForm');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = g('rsvpBtn');
      var orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending...';

      var attendance = document.querySelector('input[name="attendance"]:checked');
      var slug = siteCtx.slug;
      if (!slug) { showToast('Error: missing site'); btn.disabled = false; btn.textContent = orig; return; }

      postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
        guest_name: g('rsvpName').value.trim(),
        guest_phone: g('rsvpPhone') && g('rsvpPhone').value.trim() ? g('rsvpPhone').value.trim().slice(0, 40) : null,
        attendance: attendance ? attendance.value : 'yes',
        guests_count: parseInt(g('rsvpGuests') ? g('rsvpGuests').value : '1', 10) || 1,
        notes: g('rsvpNotes') ? g('rsvpNotes').value.trim() || null : null,
      }).then(function () {
        showToast('Thank you! Your RSVP has been received ♥');
        btn.textContent = 'Sent ♥';
        rsvpForm.reset();
        setTimeout(function () { btn.textContent = orig; btn.disabled = false; }, 3000);
      }).catch(function (err) {
        showToast('Failed: ' + err.message);
        btn.textContent = orig;
        btn.disabled = false;
      });
    });
  }

  // --- Wish Form ---
  var wishForm = g('wishForm');
  if (wishForm) {
    wishForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = g('wishBtn');
      btn.disabled = true;
      btn.textContent = 'Sending...';

      var slug = siteCtx.slug;
      if (!slug) { showToast('Error: missing site'); btn.disabled = false; btn.textContent = 'Send'; return; }

      var payload = {
        guest_name: g('wishName').value.trim(),
        message: g('wishText').value.trim(),
      };

      postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', payload).then(function (data) {
        allWishes.push(data.wish || Object.assign({}, payload, { created_at: new Date().toISOString() }));
        renderWishes();
        wishForm.reset();
        showToast('Your wish has been sent ♥');
        btn.disabled = false;
        btn.textContent = 'Send';
      }).catch(function (err) {
        showToast('Failed: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Send';
      });
    });
  }

  renderWishes();
})();
