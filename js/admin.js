// ==========================================================
// LekkeSafe — admin.js
// Week 3: admin.html — approvals, roster, incident overview.
// ==========================================================

(() => {
  let communities = [];
  let currentCommunityId = null;

  function showStatus(message, type = 'error') {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = message;
    el.className = `status-msg ${type}`;
    el.style.display = 'block';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function initAdmin() {
    const gate = document.getElementById('gate-message');

    try {
      const user = await ensureAuthSession();
      const { data: isAdmin, error } = await supabaseClient.rpc('is_admin');
      if (error) throw error;

      if (!isAdmin) {
        gate.innerHTML = `<div class="status-msg" style="display:block;">This device isn't set up as an admin. Its ID is <code>${escapeHtml(user.id)}</code> — ask an existing admin to add that exact ID to the <code>admins</code> table.</div>`;
        return;
      }
    } catch (err) {
      console.error(err);
      showStatus("Couldn't verify admin access — check your connection and try again.");
      return;
    }

    document.getElementById('admin-body').style.display = 'block';

    try {
      const { data, error } = await supabaseClient
        .from('communities').select('id, name, slug').order('name');
      if (error) throw error;
      communities = data || [];
    } catch (err) {
      console.error(err);
      showStatus("Couldn't load communities.");
      return;
    }

    const select = document.getElementById('community-select');
    select.innerHTML = communities.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (communities.length === 0) {
      select.innerHTML = `<option value="">No communities yet</option>`;
      return;
    }
    currentCommunityId = communities[0].id;
    select.addEventListener('change', () => {
      currentCommunityId = select.value;
      loadAll();
    });

    setupTabs();
    setupAdminRegisterForms();
    document.getElementById('roster-form').addEventListener('submit', handleRosterSubmit);
    loadAll();
  }

  function setupTabs() {
    document.querySelectorAll('#main-tabs .role-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#main-tabs .role-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');
        document.getElementById(`panel-${tab.dataset.panel}`).style.display = 'block';
      });
    });

    document.querySelectorAll('#register-subtabs .role-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#register-subtabs .role-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('admin-member-form').style.display = tab.dataset.subrole === 'member' ? 'block' : 'none';
        document.getElementById('admin-patroller-form').style.display = tab.dataset.subrole === 'patroller' ? 'block' : 'none';
      });
    });
  }

  function loadAll() {
    loadPendingMembers();
    loadPendingPatrollers();
    loadPatrollerOptions();
    loadRoster();
    loadIncidents();
  }

  // ---------------- Approvals ----------------

  async function loadPendingMembers() {
    const el = document.getElementById('pending-members');
    const { data, error } = await supabaseClient
      .from('members').select('*')
      .eq('community_id', currentCommunityId).eq('verified', false)
      .order('created_at', { ascending: true });

    if (error) { el.innerHTML = `<p class="helper-text">Couldn't load.</p>`; return; }
    if (!data || data.length === 0) { el.innerHTML = `<p class="helper-text">No pending members.</p>`; return; }

    el.innerHTML = '';
    data.forEach(m => {
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="admin-row-head">
          <span class="admin-row-title">${escapeHtml(m.guardian_name)}</span>
          <span class="admin-row-time">${formatDateTime(m.created_at)}</span>
        </div>
        <div class="meta">Stand ${escapeHtml(m.stand_number)}, ${escapeHtml(m.street)}${m.ward ? ` · ${escapeHtml(m.ward)}` : ''}<br>${escapeHtml(m.phone)}</div>
        ${m.house_photo_url ? `<img class="admin-row-thumb" src="${m.house_photo_url}" alt="House photo">` : ''}
        <div class="admin-row-actions">
          <button class="btn btn-primary btn-small" data-action="approve">Approve</button>
          <button class="btn btn-ghost btn-small" data-action="remove">Remove</button>
        </div>
      `;
      row.querySelector('[data-action="approve"]').addEventListener('click', () => approveRow('members', m.id, row));
      row.querySelector('[data-action="remove"]').addEventListener('click', () => removeRow('members', m.id, row));
      el.appendChild(row);
    });
  }

  async function loadPendingPatrollers() {
    const el = document.getElementById('pending-patrollers');
    const { data, error } = await supabaseClient
      .from('patrollers').select('*')
      .eq('community_id', currentCommunityId).eq('verified', false)
      .order('created_at', { ascending: true });

    if (error) { el.innerHTML = `<p class="helper-text">Couldn't load.</p>`; return; }
    if (!data || data.length === 0) { el.innerHTML = `<p class="helper-text">No pending patrollers.</p>`; return; }

    el.innerHTML = '';
    data.forEach(p => {
      const maskedId = p.id_number ? `•••• ${p.id_number.slice(-4)}` : 'not given';
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="admin-row-head">
          <span class="admin-row-title">${escapeHtml(p.name)}</span>
          <span class="admin-row-time">${formatDateTime(p.created_at)}</span>
        </div>
        <div class="meta">${escapeHtml(p.phone)} · ID ${maskedId}</div>
        ${p.photo_url ? `<img class="admin-row-thumb" src="${p.photo_url}" alt="Patroller photo">` : ''}
        <div class="admin-row-actions">
          <button class="btn btn-primary btn-small" data-action="approve">Approve</button>
          <button class="btn btn-ghost btn-small" data-action="remove">Remove</button>
        </div>
      `;
      row.querySelector('[data-action="approve"]').addEventListener('click', () => approveRow('patrollers', p.id, row));
      row.querySelector('[data-action="remove"]').addEventListener('click', () => removeRow('patrollers', p.id, row));
      el.appendChild(row);
    });
  }

  async function approveRow(table, id, rowEl) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from(table)
      .update({ verified: true, verified_by: user.id, verified_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { showStatus("Couldn't approve — try again."); return; }
    rowEl.remove();
    if (table === 'patrollers') loadPatrollerOptions();
  }

  async function removeRow(table, id, rowEl) {
    if (!confirm('Remove this application? This cannot be undone.')) return;
    const { error } = await supabaseClient.from(table).delete().eq('id', id);
    if (error) { showStatus("Couldn't remove — try again."); return; }
    rowEl.remove();
  }

  // ---------------- Roster ----------------

  async function loadPatrollerOptions() {
    const select = document.getElementById('r-patroller');
    const { data, error } = await supabaseClient
      .from('patrollers').select('id, name')
      .eq('community_id', currentCommunityId).eq('verified', true)
      .order('name');
    if (error || !data || data.length === 0) {
      select.innerHTML = `<option value="">No verified patrollers yet</option>`;
      return;
    }
    select.innerHTML = data.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  }

  async function handleRosterSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('roster-submit');
    const patrollerId = document.getElementById('r-patroller').value;
    if (!patrollerId) { showStatus('No verified patroller selected.'); return; }

    const date = document.getElementById('r-date').value;
    const startTime = document.getElementById('r-start').value;
    const endTime = document.getElementById('r-end').value;
    if (!date || !startTime || !endTime) { showStatus('Fill in date and shift times.'); return; }

    // Overnight shifts (e.g. 18:00 -> 06:00): if end time is earlier than
    // start time, assume it rolls over to the next calendar day.
    const startISO = new Date(`${date}T${startTime}:00`);
    let endDate = date;
    if (endTime <= startTime) {
      const d = new Date(`${date}T00:00:00`);
      d.setDate(d.getDate() + 1);
      endDate = d.toISOString().slice(0, 10);
    }
    const endISO = new Date(`${endDate}T${endTime}:00`);

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';

    try {
      const { error } = await supabaseClient.from('roster').insert({
        community_id: currentCommunityId,
        patroller_id: patrollerId,
        date,
        shift_start: startISO.toISOString(),
        shift_end: endISO.toISOString(),
        car_registration: document.getElementById('r-reg').value.trim() || null,
        car_color: document.getElementById('r-color').value.trim() || null,
        car_make_model: document.getElementById('r-model').value.trim() || null,
      });
      if (error) throw error;

      showStatus('Added to roster.', 'success');
      document.getElementById('roster-form').reset();
      document.getElementById('r-start').value = '18:00';
      document.getElementById('r-end').value = '06:00';
      loadRoster();
    } catch (err) {
      console.error(err);
      showStatus("Couldn't add to roster — try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add to roster';
    }
  }

  async function loadRoster() {
    const el = document.getElementById('roster-list');
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabaseClient
      .from('roster')
      .select('id, date, shift_start, shift_end, car_registration, car_color, car_make_model, status, patrollers(name)')
      .eq('community_id', currentCommunityId)
      .gte('date', today)
      .order('date', { ascending: true });

    if (error) { el.innerHTML = `<p class="helper-text">Couldn't load roster.</p>`; return; }
    if (!data || data.length === 0) { el.innerHTML = `<p class="helper-text">Nothing scheduled yet.</p>`; return; }

    el.innerHTML = '';
    data.forEach(r => {
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="admin-row-head">
          <span class="admin-row-title">${escapeHtml(r.patrollers?.name || 'Patroller')}</span>
          <span class="admin-row-time">${r.date}</span>
        </div>
        <div class="meta">
          ${formatTime(r.shift_start)}–${formatTime(r.shift_end)}
          ${r.car_registration ? ` · ${escapeHtml(r.car_registration)}` : ''}
          ${r.car_color || r.car_make_model ? ` (${escapeHtml(r.car_color || '')} ${escapeHtml(r.car_make_model || '')})` : ''}
          ${r.status === 'checked_in' ? ' <span class="pill-live">On duty</span>' : ''}
        </div>
        <div class="admin-row-actions">
          <button class="btn btn-ghost btn-small" data-action="delete-roster">Remove shift</button>
        </div>
      `;
      row.querySelector('[data-action="delete-roster"]').addEventListener('click', async () => {
        if (!confirm('Remove this shift?')) return;
        const { error: delErr } = await supabaseClient.from('roster').delete().eq('id', r.id);
        if (delErr) { showStatus("Couldn't remove shift."); return; }
        row.remove();
      });
      el.appendChild(row);
    });
  }

  // ---------------- Incidents overview ----------------

  const TYPE_LABELS = {
    intruder: '🚨 Intruder in yard',
    violence: '🔥 Violence / fighting',
    theft_neighbour: '👁️ Theft next door',
    suspicious_person: '🏠 Suspicious person',
    medical_fire_kids: '🆘 Medical / fire / kids alone',
    panic: '🆘 PANIC BUTTON',
    other: '✏️ Other',
  };

  async function loadIncidents() {
    const el = document.getElementById('incident-overview');
    const { data, error } = await supabaseClient
      .from('incidents')
      .select('*')
      .eq('community_id', currentCommunityId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) { el.innerHTML = `<p class="helper-text">Couldn't load incidents.</p>`; return; }
    if (!data || data.length === 0) { el.innerHTML = `<p class="helper-text">No incidents logged yet.</p>`; return; }

    el.innerHTML = '';
    data.forEach(i => {
      const resolved = i.status === 'attended' || i.status === 'closed';
      const row = document.createElement('div');
      row.className = `admin-row ${resolved ? 'resolved' : ''}`;
      row.innerHTML = `
        <div class="admin-row-head">
          <span class="admin-row-title">${TYPE_LABELS[i.type] || i.type}</span>
          <span class="admin-row-time">${formatDateTime(i.created_at)}</span>
        </div>
        <div class="meta">Stand ${escapeHtml(i.stand_number || '?')}${i.description ? ` — ${escapeHtml(i.description)}` : ''} · ${statusLabel(i.status)}</div>
        ${i.gps_lat ? `<a href="https://maps.google.com/?q=${i.gps_lat},${i.gps_lng}" target="_blank" rel="noopener">Open location</a>` : ''}
        ${i.status !== 'closed' ? `<div class="admin-row-actions"><button class="btn btn-ghost btn-small" data-action="close">Close</button></div>` : ''}
      `;
      const closeBtn = row.querySelector('[data-action="close"]');
      if (closeBtn) closeBtn.addEventListener('click', async () => {
        const { error: upErr } = await supabaseClient.from('incidents').update({ status: 'closed' }).eq('id', i.id);
        if (upErr) { showStatus("Couldn't close incident."); return; }
        loadIncidents();
      });
      el.appendChild(row);
    });
  }

  function statusLabel(status) {
    return { pending: 'Pending', acknowledged: 'Acknowledged', attended: 'Attended', closed: 'Closed' }[status] || status;
  }

  // ---------------- Register (admin adds someone directly) ----------------

  function setupPhotoPreview(inputId, previewId, textId, labelId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const text = document.getElementById(textId);
    const label = document.getElementById(labelId);
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        preview.src = e.target.result;
        preview.style.display = 'block';
        text.textContent = file.name;
        label.classList.add('has-photo');
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadPhoto(file, folder) {
    const ext = file.name.split('.').pop();
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseClient.storage.from('lekkesafe-photos').upload(path, file, { upsert: false });
    if (error) throw error;
    return supabaseClient.storage.from('lekkesafe-photos').getPublicUrl(path).data.publicUrl;
  }

  function setupAdminRegisterForms() {
    setupPhotoPreview('am-photo', 'am-photo-preview', 'am-photo-text', 'am-photo-label');
    setupPhotoPreview('ap-photo', 'ap-photo-preview', 'ap-photo-text', 'ap-photo-label');

    document.getElementById('admin-member-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('am-submit');
      btn.disabled = true; btn.textContent = 'Adding…';
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const photoFile = document.getElementById('am-photo').files[0];
        const photoUrl = photoFile ? await uploadPhoto(photoFile, 'house-photos') : null;

        const { error } = await supabaseClient.from('members').insert({
          community_id: currentCommunityId,
          stand_number: document.getElementById('am-stand').value.trim(),
          street: document.getElementById('am-street').value.trim(),
          ward: document.getElementById('am-ward').value.trim() || null,
          guardian_name: document.getElementById('am-guardian').value.trim(),
          phone: document.getElementById('am-phone').value.trim(),
          house_photo_url: photoUrl,
          verified: true,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        });
        if (error) throw error;

        showStatus('Member added and approved.', 'success');
        document.getElementById('admin-member-form').reset();
        document.getElementById('am-photo-preview').style.display = 'none';
        loadPendingMembers();
      } catch (err) {
        console.error(err);
        showStatus("Couldn't add member — try again.");
      } finally {
        btn.disabled = false; btn.textContent = 'Add member';
      }
    });

    document.getElementById('admin-patroller-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('ap-submit');
      btn.disabled = true; btn.textContent = 'Adding…';
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const photoFile = document.getElementById('ap-photo').files[0];
        const photoUrl = photoFile ? await uploadPhoto(photoFile, 'patroller-photos') : null;

        const { error } = await supabaseClient.from('patrollers').insert({
          community_id: currentCommunityId,
          name: document.getElementById('ap-name').value.trim(),
          phone: document.getElementById('ap-phone').value.trim(),
          id_number: document.getElementById('ap-id').value.trim(),
          photo_url: photoUrl,
          verified: true,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        });
        if (error) throw error;

        showStatus('Patroller added and approved.', 'success');
        document.getElementById('admin-patroller-form').reset();
        document.getElementById('ap-photo-preview').style.display = 'none';
        loadPendingPatrollers();
        loadPatrollerOptions();
      } catch (err) {
        console.error(err);
        showStatus("Couldn't add patroller — try again.");
      } finally {
        btn.disabled = false; btn.textContent = 'Add patroller';
      }
    });
  }

  LekkeSafe.initAdmin = initAdmin;
})();
