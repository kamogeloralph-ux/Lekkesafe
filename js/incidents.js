// ==========================================================
// LekkeSafe — incidents.js
// Week 2: dashboard.html — one-tap reports + panic button.
// ==========================================================

(() => {
  let currentMember = null;
  let currentCommunity = null;
  let panicIncidentId = null;
  let panicWatchId = null;
  let panicTimeoutId = null;

  function showStatus(message, type = 'error') {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = message;
    el.className = `status-msg ${type}`;
    el.style.display = 'block';
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function getLocation() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null), // don't block reporting on a denied/failed GPS permission
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  async function initDashboard() {
    const slug = getQueryParam('community');
    const nameEl = document.getElementById('community-name');
    const addrEl = document.getElementById('member-address');

    try {
      const user = await ensureAuthSession();

      const { data: community, error: commErr } = await supabaseClient
        .from('communities').select('id, name, slug').eq('slug', slug).single();
      if (commErr) throw commErr;
      currentCommunity = community;
      nameEl.textContent = community.name;

      const { data: member, error: memErr } = await supabaseClient
        .from('members').select('*')
        .eq('auth_user_id', user.id).eq('community_id', community.id)
        .single();
      if (memErr) throw memErr;
      currentMember = member;

      addrEl.textContent = `Stand ${member.stand_number}, ${member.street}` +
        (member.verified ? '' : ' — pending verification');

    } catch (err) {
      console.error(err);
      nameEl.textContent = 'Not registered here';
      showStatus("We couldn't find your registration for this community. Please register first.");
      const link = document.createElement('a');
      link.href = `register.html?community=${encodeURIComponent(slug || '')}`;
      link.className = 'btn btn-primary';
      link.style.display = 'block';
      link.style.marginTop = '12px';
      link.textContent = 'Register';
      addrEl.after(link);
      return;
    }

    loadTonightsPatrol();
    setupReportButtons();
    setupPanicButton();
  }

  async function loadTonightsPatrol() {
    const el = document.getElementById('patrol-content');
    const today = new Date().toISOString().slice(0, 10);

    try {
      const { data, error } = await supabaseClient
        .from('roster')
        .select('car_registration, car_color, car_make_model, shift_start, shift_end, status, patrollers(name, phone)')
        .eq('community_id', currentCommunity.id)
        .eq('date', today);
      if (error) throw error;

      if (!data || data.length === 0) {
        el.innerHTML = `<p class="helper-text" style="margin:0;">No patrol scheduled tonight yet.</p>`;
        return;
      }

      el.innerHTML = data.map(r => `
        <div class="patrol-row">
          <div>
            <strong>${escapeHtml(r.patrollers?.name || 'Patroller')}</strong>
            <span class="meta">${escapeHtml(r.patrollers?.phone || '')}</span>
          </div>
          <div class="meta">
            ${escapeHtml(r.car_color || '')} ${escapeHtml(r.car_make_model || '')} · ${escapeHtml(r.car_registration || 'no reg')}
            <br>${formatTime(r.shift_start)}–${formatTime(r.shift_end)}
            ${r.status === 'checked_in' ? '<span class="pill-live">On duty now</span>' : ''}
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error(err);
      el.innerHTML = `<p class="helper-text" style="margin:0;">Couldn't load tonight's roster.</p>`;
    }
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function setupReportButtons() {
    document.querySelectorAll('.report-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (type === 'other') {
          document.getElementById('other-note-plaque').style.display = 'block';
          document.getElementById('other-note-plaque').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        sendReport(type, btn);
      });
    });

    document.getElementById('other-send').addEventListener('click', () => {
      const note = document.getElementById('other-note').value.trim();
      sendReport('other', document.getElementById('other-send'), note);
    });
  }

  async function sendReport(type, btnEl, description = null) {
    const original = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.classList.add('report-btn-sending');

    try {
      const loc = await getLocation();
      const { error } = await supabaseClient.from('incidents').insert({
        community_id: currentCommunity.id,
        member_id: currentMember.id,
        type,
        description,
        stand_number: currentMember.stand_number,
        gps_lat: loc?.lat ?? null,
        gps_lng: loc?.lng ?? null,
      });
      if (error) throw error;

      showStatus("Sent — tonight's patrollers have been notified.", 'success');
      btnEl.innerHTML = '✓ Sent';
      setTimeout(() => {
        btnEl.innerHTML = original;
        btnEl.disabled = false;
        btnEl.classList.remove('report-btn-sending');
      }, 2500);

      if (type === 'other') {
        document.getElementById('other-note').value = '';
        document.getElementById('other-note-plaque').style.display = 'none';
      }
    } catch (err) {
      console.error(err);
      showStatus("Couldn't send your report — check your connection and try again.");
      btnEl.innerHTML = original;
      btnEl.disabled = false;
      btnEl.classList.remove('report-btn-sending');
    }
  }

  function setupPanicButton() {
    document.getElementById('panic-btn').addEventListener('click', triggerPanic);
  }

  async function triggerPanic() {
    const btn = document.getElementById('panic-btn');
    if (btn.classList.contains('panic-active')) return; // already active
    btn.classList.add('panic-active');
    btn.querySelector('.panic-fab-label').textContent = 'SENT';

    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);

    try {
      const loc = await getLocation();
      const { data, error } = await supabaseClient.from('incidents').insert({
        community_id: currentCommunity.id,
        member_id: currentMember.id,
        type: 'panic',
        stand_number: currentMember.stand_number,
        gps_lat: loc?.lat ?? null,
        gps_lng: loc?.lng ?? null,
      }).select('id').single();
      if (error) throw error;

      panicIncidentId = data.id;
      showStatus('Panic alert sent — sharing your live location with patrollers for 15 minutes.', 'success');
      startLiveLocationShare();
    } catch (err) {
      console.error(err);
      showStatus("Couldn't send your panic alert — check your connection.");
      btn.classList.remove('panic-active');
      btn.querySelector('.panic-fab-label').textContent = 'PANIC';
    }
  }

  function startLiveLocationShare() {
    if (!navigator.geolocation || !panicIncidentId) return;

    panicWatchId = navigator.geolocation.watchPosition(
      pos => {
        supabaseClient.from('incidents').update({
          gps_lat: pos.coords.latitude,
          gps_lng: pos.coords.longitude,
        }).eq('id', panicIncidentId).then(() => {});
      },
      err => console.error('Location watch error:', err),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );

    // Stop sharing after 15 minutes.
    panicTimeoutId = setTimeout(stopPanic, 15 * 60 * 1000);
  }

  function stopPanic() {
    if (panicWatchId !== null) navigator.geolocation.clearWatch(panicWatchId);
    if (panicTimeoutId !== null) clearTimeout(panicTimeoutId);
    panicWatchId = null;
    panicTimeoutId = null;
    panicIncidentId = null;
    const btn = document.getElementById('panic-btn');
    if (btn) {
      btn.classList.remove('panic-active');
      btn.querySelector('.panic-fab-label').textContent = 'PANIC';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  // Extends the LekkeSafe object created in app.js (loaded before this script).
  LekkeSafe.initDashboard = initDashboard;
})();
