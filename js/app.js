// ==========================================================
// LekkeSafe — app.js
// Week 1: community picker + member/patroller registration.
// ==========================================================

const LekkeSafe = (() => {

  function showStatus(message, type = 'error') {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = message;
    el.className = `status-msg ${type}`;
    el.style.display = 'block';
  }

  function hideStatus() {
    const el = document.getElementById('status');
    if (el) el.style.display = 'none';
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // ---------------- index.html: community picker ----------------

  async function loadCommunityList() {
    const listEl = document.getElementById('community-list');
    const searchEl = document.getElementById('community-search');
    if (!listEl) return;

    let communities = [];

    try {
      const { data, error } = await supabaseClient
        .from('communities')
        .select('id, name, slug, province')
        .order('name', { ascending: true });

      if (error) throw error;
      communities = data || [];
    } catch (err) {
      console.error(err);
      showStatus("Couldn't load communities — check your connection and try again.");
      return;
    }

    function render(filtered) {
      listEl.innerHTML = '';
      if (filtered.length === 0) {
        listEl.innerHTML = `<p class="helper-text">No matches. Try a different search, or ask your CPF leader to add your community.</p>`;
        return;
      }
      filtered.forEach(c => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'community-row';
        row.innerHTML = `
          <span>
            <span>${escapeHtml(c.name)}</span><br>
            <span class="meta">${escapeHtml(c.province || '')}</span>
          </span>
          <span class="arrow">→</span>
        `;
        row.addEventListener('click', () => {
          window.location.href = `register.html?community=${encodeURIComponent(c.slug)}`;
        });
        listEl.appendChild(row);
      });
    }

    render(communities);

    if (searchEl) {
      searchEl.addEventListener('input', () => {
        const q = searchEl.value.trim().toLowerCase();
        render(communities.filter(c =>
          c.name.toLowerCase().includes(q) || (c.province || '').toLowerCase().includes(q)
        ));
      });
    }
  }

  // ---------------- register.html ----------------

  let currentCommunity = null;

  async function initRegisterPage() {
    try {
      await ensureAuthSession();
    } catch (err) {
      showStatus(err.message);
      return;
    }

    const slug = getQueryParam('community');
    const headingEl = document.getElementById('community-heading');
    const subEl = document.getElementById('community-sub');

    if (!slug) {
      subEl.textContent = 'No community selected.';
      showStatus('Pick your community first.');
      const backLink = document.createElement('a');
      backLink.href = 'index.html';
      backLink.className = 'btn btn-ghost';
      backLink.textContent = 'Choose a community';
      backLink.style.display = 'block';
      backLink.style.marginTop = '12px';
      subEl.after(backLink);
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from('communities')
        .select('id, name, slug')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      currentCommunity = data;
      headingEl.textContent = `Register — ${data.name}`;
      subEl.textContent = 'Your details are reviewed by your community admin before you get access.';
    } catch (err) {
      console.error(err);
      subEl.textContent = "Couldn't find that community.";
      showStatus('Community not found — go back and pick again.');
      return;
    }

    setupRoleTabs();
    setupPhotoPreview('m-photo', 'm-photo-preview', 'm-photo-text', 'm-photo-label');
    setupPhotoPreview('p-photo', 'p-photo-preview', 'p-photo-text', 'p-photo-label');
    document.getElementById('member-form').addEventListener('submit', handleMemberSubmit);
    document.getElementById('patroller-form').addEventListener('submit', handlePatrollerSubmit);
  }

  function setupRoleTabs() {
    const tabs = document.querySelectorAll('.role-tab');
    const memberForm = document.getElementById('member-form');
    const patrollerForm = document.getElementById('patroller-form');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        hideStatus();
        if (tab.dataset.role === 'member') {
          memberForm.style.display = 'block';
          patrollerForm.style.display = 'none';
        } else {
          memberForm.style.display = 'none';
          patrollerForm.style.display = 'block';
        }
      });
    });
  }

  function setupPhotoPreview(inputId, previewId, textId, labelId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const text = document.getElementById(textId);
    const label = document.getElementById(labelId);
    if (!input) return;
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
    const { error } = await supabaseClient.storage
      .from('lekkesafe-photos')
      .upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = supabaseClient.storage.from('lekkesafe-photos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleMemberSubmit(e) {
    e.preventDefault();
    hideStatus();
    const submitBtn = document.getElementById('member-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering…';

    try {
      const photoFile = document.getElementById('m-photo').files[0];
      if (!photoFile) throw new Error('Please add a photo of your house.');

      const photoUrl = await uploadPhoto(photoFile, 'house-photos');
      const user = await ensureAuthSession();

      const { error } = await supabaseClient.from('members').insert({
        community_id: currentCommunity.id,
        auth_user_id: user.id,
        stand_number: document.getElementById('m-stand').value.trim(),
        street: document.getElementById('m-street').value.trim(),
        ward: document.getElementById('m-ward').value.trim() || null,
        guardian_name: document.getElementById('m-guardian').value.trim(),
        phone: document.getElementById('m-phone').value.trim(),
        house_photo_url: photoUrl,
      });
      if (error) throw error;

      showStatus('Registered! Taking you to your dashboard…', 'success');
      setTimeout(() => {
        window.location.href = `dashboard.html?community=${encodeURIComponent(currentCommunity.slug)}`;
      }, 900);
    } catch (err) {
      console.error(err);
      showStatus(err.message || 'Something went wrong — please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register as member';
    }
  }

  async function handlePatrollerSubmit(e) {
    e.preventDefault();
    hideStatus();
    const submitBtn = document.getElementById('patroller-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const photoFile = document.getElementById('p-photo').files[0];
      if (!photoFile) throw new Error('Please add a profile photo.');

      const photoUrl = await uploadPhoto(photoFile, 'patroller-photos');
      const user = await ensureAuthSession();

      const { error } = await supabaseClient.from('patrollers').insert({
        community_id: currentCommunity.id,
        auth_user_id: user.id,
        name: document.getElementById('p-name').value.trim(),
        phone: document.getElementById('p-phone').value.trim(),
        id_number: document.getElementById('p-id').value.trim(),
        photo_url: photoUrl,
      });
      if (error) throw error;

      showStatus('Application submitted! Taking you to your patroller view…', 'success');
      setTimeout(() => {
        window.location.href = `patroller.html?community=${encodeURIComponent(currentCommunity.slug)}`;
      }, 900);
    } catch (err) {
      console.error(err);
      showStatus(err.message || 'Something went wrong — please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Apply as patroller';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { loadCommunityList, initRegisterPage };
})();
