// ==========================================================
// LekkeSafe — patroller.js
// Week 2: patroller.html — live incident feed via Realtime.
// ==========================================================

(() => {
  let currentPatroller = null;
  let currentCommunity = null;
  let realtimeChannel = null;
  const seenIds = new Set();

  const TYPE_LABELS = {
    intruder: '🚨 Intruder in yard',
    violence: '🔥 Violence / fighting',
    theft_neighbour: '👁️ Theft next door',
    suspicious_person: '🏠 Suspicious person',
    medical_fire_kids: '🆘 Medical / fire / kids alone',
    panic: '🆘 PANIC BUTTON',
    other: '✏️ Other',
  };

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

  async function initPatrollerView() {
    const slug = getQueryParam('community');
    const nameEl = document.getElementById('community-name');
    const bannerEl = document.getElementById('verified-banner');

    try {
      const user = await ensureAuthSession();

      const { data: community, error: commErr } = await supabaseClient
        .from('communities').select('id, name, slug').eq('slug', slug).single();
      if (commErr) throw commErr;
      currentCommunity = community;
      nameEl.textContent = `${community.name} — Patroller`;

      const { data: patroller, error: patErr } = await supabaseClient
        .from('patrollers').select('*')
        .eq('auth_user_id', user.id).eq('community_id', community.id)
        .single();
      if (patErr) throw patErr;
      currentPatroller = patroller;

      if (!patroller.verified) {
        bannerEl.innerHTML = `<div class="status-msg" style="display:block;">Your application is still pending admin approval. You'll be able to check in for shifts and see live alerts once verified.</div>`;
        return;
      }
    } catch (err) {
      console.error(err);
      nameEl.textContent = 'Not registered here';
      showStatus("We couldn't find a patroller application for this community. Please apply first.");
      const link = document.createElement('a');
      link.href = `register.html?community=${encodeURIComponent(slug || '')}`;
      link.className = 'btn btn-primary';
      link.style.display = 'block';
      link.style.marginTop = '12px';
      link.textContent = 'Apply';
      bannerEl.after(link);
      return;
    }

    setupCheckIn();
    loadRecentIncidents();
    subscribeToIncidents();
  }

  async function setupCheckIn() {
    const plaque = document.getElementById('checkin-plaque');
    const content = document.getElementById('checkin-content');
    const today = new Date().toISOString().slice(0, 10);

    const { data: shift, error } = await supabaseClient
      .from('roster').select('*')
      .eq('patroller_id', currentPatroller.id).eq('date', today)
      .maybeSingle();

    if (error || !shift) {
      plaque.style.display = 'block';
      content.innerHTML = `<p class="helper-text" style="margin:0;">No shift scheduled for you tonight.</p>`;
      return;
    }

    plaque.style.display = 'block';
    renderCheckIn(shift);

    async function renderCheckIn(s) {
      const isCheckedIn = s.status === 'checked_in';
      content.innerHTML = `
        <p style="margin:0 0 12px;">${formatTime(s.shift_start)}–${formatTime(s.shift_end)}${s.car_registration ? ` · ${escapeHtml(s.car_registration)}` : ''}</p>
        <button class="btn ${isCheckedIn ? 'btn-ghost' : 'btn-primary'}" id="checkin-btn" ${isCheckedIn ? 'disabled' : ''}>
          ${isCheckedIn ? '✓ Checked in' : 'Check in for shift'}
        </button>
      `;
      if (!isCheckedIn) {
        document.getElementById('checkin-btn').addEventListener('click', async () => {
          const { error: upErr } = await supabaseClient
            .from('roster')
            .update({ status: 'checked_in', checked_in_at: new Date().toISOString() })
            .eq('id', s.id);
          if (upErr) { showStatus("Couldn't check in — try again."); return; }
          s.status = 'checked_in';
          renderCheckIn(s);
        });
      }
    }
  }

  async function loadRecentIncidents() {
    const { data, error } = await supabaseClient
      .from('incidents')
      .select('*')
      .eq('community_id', currentCommunity.id)
      .in('status', ['pending', 'acknowledged'])
      .order('created_at', { ascending: false })
      .limit(20);

    const feed = document.getElementById('incident-feed');
    feed.innerHTML = '';

    if (error) {
      feed.innerHTML = `<p class="helper-text">Couldn't load alerts.</p>`;
      return;
    }
    if (!data || data.length === 0) {
      feed.innerHTML = `<p class="helper-text">No active alerts right now.</p>`;
      return;
    }
    data.forEach(renderIncidentCard);
  }

  function subscribeToIncidents() {
    realtimeChannel = supabaseClient
      .channel(`incidents-${currentCommunity.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'incidents',
        filter: `community_id=eq.${currentCommunity.id}`,
      }, payload => {
        if (navigator.vibrate) navigator.vibrate(payload.new.type === 'panic' ? [300, 100, 300, 100, 300] : [200]);
        renderIncidentCard(payload.new, true);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'incidents',
        filter: `community_id=eq.${currentCommunity.id}`,
      }, payload => {
        updateIncidentCard(payload.new);
      })
      .subscribe();
  }

  function renderIncidentCard(incident, prepend = false) {
    if (seenIds.has(incident.id)) return;
    seenIds.add(incident.id);

    const feed = document.getElementById('incident-feed');
    if (feed.querySelector('.helper-text')) feed.innerHTML = '';

    const card = document.createElement('div');
    card.className = `incident-card ${incident.type === 'panic' ? 'incident-panic' : ''}`;
    card.id = `incident-${incident.id}`;
    card.innerHTML = buildCardHtml(incident);
    attachCardHandlers(card, incident);

    if (prepend) feed.prepend(card); else feed.appendChild(card);
  }

  function buildCardHtml(incident) {
    const mapLink = incident.gps_lat
      ? `<a href="https://maps.google.com/?q=${incident.gps_lat},${incident.gps_lng}" target="_blank" rel="noopener">Open location in Maps</a>`
      : '<span class="meta">No GPS available</span>';

    return `
      <div class="incident-head">
        <span class="incident-type">${TYPE_LABELS[incident.type] || incident.type}</span>
        <span class="incident-time">${formatTime(incident.created_at)}</span>
      </div>
      <div class="meta">Stand ${escapeHtml(incident.stand_number || '?')}${incident.description ? ` — ${escapeHtml(incident.description)}` : ''}</div>
      <div class="incident-actions">
        ${mapLink}
        <span class="incident-status" data-status-for="${incident.id}">${statusLabel(incident.status)}</span>
      </div>
      <div class="incident-buttons">
        <button class="btn btn-ghost btn-small" data-action="acknowledge" ${incident.status !== 'pending' ? 'disabled' : ''}>Acknowledge</button>
        <button class="btn btn-primary btn-small" data-action="attend">Mark attended</button>
      </div>
    `;
  }

  function attachCardHandlers(card, incident) {
    card.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => updateIncidentStatus(incident.id, btn.dataset.action));
    });
  }

  async function updateIncidentStatus(id, action) {
    const statusMap = { acknowledge: 'acknowledged', attend: 'attended' };
    const newStatus = statusMap[action];
    const update = { status: newStatus };
    if (newStatus === 'attended') {
      update.attended_by = currentPatroller.id;
      update.attended_at = new Date().toISOString();
    }
    const { error } = await supabaseClient.from('incidents').update(update).eq('id', id);
    if (error) showStatus("Couldn't update that alert — try again.");
  }

  function updateIncidentCard(incident) {
    const card = document.getElementById(`incident-${incident.id}`);
    if (!card) return;
    const statusEl = card.querySelector(`[data-status-for="${incident.id}"]`);
    if (statusEl) statusEl.textContent = statusLabel(incident.status);
    const ackBtn = card.querySelector('[data-action="acknowledge"]');
    if (ackBtn && incident.status !== 'pending') ackBtn.disabled = true;
    if (incident.status === 'attended' || incident.status === 'closed') {
      card.classList.add('incident-resolved');
    }
  }

  function statusLabel(status) {
    return { pending: 'Pending', acknowledged: 'Acknowledged', attended: 'Attended', closed: 'Closed' }[status] || status;
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  LekkeSafe.initPatrollerView = initPatrollerView;
})();
