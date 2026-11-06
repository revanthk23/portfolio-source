// Section-scoped editor for the multi-site CMS. Uses the private cms-media bucket.
(function () {
  "use strict";
  const BUCKET = "cms-media";
  let activeSection = null;
  let activeSectionId = null;
  let activeRecords = [];
  let activeMedia = [];
  let editingContentId = null;
  let selectedMedia = new Set();

  function client() { return window.portfolioSupabaseClient; }
  function siteId() { return window.portfolioCmsSiteId; }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c];
    });
  }
  function message(text, type) {
    const el = document.getElementById("cmsEditorMessage");
    if (el) { el.textContent = text; el.className = "page-message " + (type || ""); }
  }
  function supports(key) {
    if (!siteId()) return false;
    return key === "works" || (key.indexOf("topic__") === 0 &&
      (window.portfolioCmsStructureSynced || {}).subsections > 0);
  }
  async function resolveSection(key) {
    const result = await client().from("cms_sections")
      .select("id,section_key,title,page_id")
      .eq("site_id", siteId()).eq("section_key", key).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("This section has not synced to the CMS yet. Refresh the dashboard and try again.");
    return result.data;
  }
  async function signedMedia(row) {
    const result = await client().storage.from(BUCKET).createSignedUrl(row.storage_path, 3600);
    return { row: row, url: result.data ? result.data.signedUrl : "" };
  }
  async function load(key) {
    activeSection = key;
    editingContentId = null;
    selectedMedia = new Set();
    const panel = document.getElementById("contentPanel");
    panel.innerHTML = '<div class="loading-state">Loading section editor…</div>';
    try {
      const section = await resolveSection(key);
      activeSectionId = section.id;
      const [contentResult, mediaResult] = await Promise.all([
        client().from("cms_content").select("*").eq("site_id", siteId()).eq("section_id", section.id)
          .order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
        client().from("cms_media").select("*").eq("site_id", siteId()).eq("section_id", section.id)
          .order("sort_order", { ascending: true }).order("created_at", { ascending: false })
      ]);
      if (contentResult.error) throw contentResult.error;
      if (mediaResult.error) throw mediaResult.error;
      activeRecords = contentResult.data || [];
      activeMedia = await Promise.all((mediaResult.data || []).map(signedMedia));
      render(section);
    } catch (error) {
      panel.innerHTML = '<div class="notice error"><strong>Could not load section editor</strong><p>' +
        esc(error.message || "Unknown error") + '</p></div>';
    }
  }
  function render(section) {
    const panel = document.getElementById("contentPanel");
    const entries = activeRecords.map(function (record) {
      const payload = record.payload || {};
      return '<article class="cms-entry"><div class="cms-entry-head"><strong>' + esc(record.title) +
        '</strong><span class="status-pill ' + esc(record.status) + '">' + esc(record.status) + '</span></div>' +
        '<p>' + esc(payload.subtitle || payload.description || "No description") + '</p>' +
        '<div class="record-actions"><button class="secondary-button" data-cms-edit="' + esc(record.id) + '">Edit</button>' +
        '<button class="danger-button" data-cms-delete="' + esc(record.id) + '">Delete</button></div></article>';
    }).join("");
    const media = activeMedia.map(function (item) {
      const row = item.row, checked = selectedMedia.has(row.id) ? " checked" : "";
      const preview = item.url ? (row.media_type === "video"
        ? '<video controls preload="metadata" src="' + esc(item.url) + '"></video>'
        : '<img loading="lazy" src="' + esc(item.url) + '" alt="' + esc(row.alt_text || row.title) + '">')
        : '<div class="media-unavailable">Preview unavailable</div>';
      return '<div class="cms-media-item">' + preview + '<label><input type="checkbox" data-cms-media="' +
        esc(row.id) + '"' + checked + '> ' + esc(row.title) + '</label></div>';
    }).join("");
    panel.innerHTML =
      '<div class="section-heading"><div><h2>' + esc(section.title) + '</h2><p>Manage entries and media for this website section.</p></div></div>' +
      '<div id="cmsEditorMessage" class="page-message" role="status"></div>' +
      '<div class="cms-editor-layout"><section class="cms-editor-card"><h3>Entries (' + activeRecords.length + ')</h3>' +
      (entries || '<p class="empty-state">No entries yet. Add your first entry using the form.</p>') +
      '<form id="cmsEntryForm"><h3 id="cmsFormTitle">Add entry</h3>' +
      '<label>Title<input id="cmsTitle" maxlength="180" required placeholder="e.g. Website project"></label>' +
      '<label>Subtitle / category<input id="cmsSubtitle" maxlength="180" placeholder="e.g. Website Development"></label>' +
      '<label>Description<textarea id="cmsDescription" rows="5" placeholder="Describe this work or subsection content"></textarea></label>' +
      '<label>Upload images or videos<input id="cmsUpload" type="file" accept="image/*,video/*" multiple></label>' +
      '<p class="cms-help">Uploaded files stay in the private CMS media bucket and are associated with this section. Select the media below to attach it to this entry.</p>' +
      '<div class="form-row"><label>Status<select id="cmsStatus"><option value="draft">Draft</option><option value="published">Published</option></select></label>' +
      '<label>Display order<input id="cmsSort" type="number" value="0"></label></div>' +
      '<div class="form-actions"><button class="primary-button" type="submit">Save entry</button>' +
      '<button class="secondary-button" type="button" id="cmsClear">Clear</button></div></form></section>' +
      '<section class="cms-media-panel"><h3>Section media (' + activeMedia.length + ')</h3>' +
      '<p class="cms-help">Tick the files that belong with the entry being edited. Uploads are private until their records are published.</p>' +
      '<div class="cms-media-list">' + (media || '<p class="empty-state">No media uploaded to this section yet.</p>') + '</div></section></div>';
  }
  function clearForm() {
    editingContentId = null; selectedMedia = new Set();
    const form = document.getElementById("cmsEntryForm");
    if (form) form.reset();
    const title = document.getElementById("cmsFormTitle");
    if (title) title.textContent = "Add entry";
    const sort = document.getElementById("cmsSort");
    if (sort) sort.value = "0";
    document.querySelectorAll("[data-cms-media]").forEach(function (box) { box.checked = false; });
  }
  function edit(id) {
    const record = activeRecords.find(function (item) { return item.id === id; });
    if (!record) return;
    editingContentId = id;
    const payload = record.payload || {};
    document.getElementById("cmsFormTitle").textContent = "Edit entry";
    document.getElementById("cmsTitle").value = record.title || "";
    document.getElementById("cmsSubtitle").value = payload.subtitle || "";
    document.getElementById("cmsDescription").value = payload.description || "";
    document.getElementById("cmsStatus").value = record.status || "draft";
    document.getElementById("cmsSort").value = record.sort_order || 0;
    selectedMedia = new Set(Array.isArray(payload.media_ids) ? payload.media_ids : []);
    document.querySelectorAll("[data-cms-media]").forEach(function (box) {
      box.checked = selectedMedia.has(box.dataset.cmsMedia);
    });
  }
  async function upload(files) {
    const input = document.getElementById("cmsUpload");
    for (const file of Array.from(files || [])) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = siteId() + "/" + activeSectionId + "/" + Date.now() + "-" +
        Math.random().toString(36).slice(2, 8) + "-" + safe;
      const uploaded = await client().storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type || undefined
      });
      if (uploaded.error) { message("Upload failed: " + uploaded.error.message, "error"); return; }
      const type = file.type.indexOf("video/") === 0 ? "video" : "image";
      const inserted = await client().from("cms_media").insert({
        site_id: siteId(), page_id: (window.portfolioCmsStructureSynced || {}).pageId,
        section_id: activeSectionId, storage_path: path, media_type: type,
        title: file.name, mime_type: file.type || null, file_size: file.size,
        status: "draft", created_by: (await client().auth.getUser()).data.user.id
      }).select("*").single();
      if (inserted.error) {
        await client().storage.from(BUCKET).remove([path]);
        message("File uploaded but its media record could not be saved: " + inserted.error.message, "error");
        return;
      }
    }
    await load(activeSection);
    message("Upload complete. Select the new media and save the entry.", "success");
  }
  async function save(event) {
    event.preventDefault();
    const title = document.getElementById("cmsTitle").value.trim();
    if (!title) return;
    const payload = {
      subtitle: document.getElementById("cmsSubtitle").value.trim(),
      description: document.getElementById("cmsDescription").value.trim(),
      media_ids: Array.from(selectedMedia)
    };
    const status = document.getElementById("cmsStatus").value;
    const data = {
      site_id: siteId(), page_id: (window.portfolioCmsStructureSynced || {}).pageId,
      section_id: activeSectionId, title: title, slug: null, payload: payload,
      status: status, sort_order: Number(document.getElementById("cmsSort").value || 0),
      published_at: status === "published" ? new Date().toISOString() : null
    };
    const result = editingContentId
      ? await client().from("cms_content").update(data).eq("id", editingContentId)
      : await client().from("cms_content").insert(data);
    if (result.error) { message("Save failed: " + result.error.message, "error"); return; }
    await load(activeSection);
    message("Entry saved successfully.", "success");
  }
  async function remove(id) {
    const row = activeRecords.find(function (item) { return item.id === id; });
    if (!row || !window.confirm('Delete "' + row.title + '"?')) return;
    const result = await client().from("cms_content").delete().eq("id", id);
    if (result.error) { message("Delete failed: " + result.error.message, "error"); return; }
    await load(activeSection);
  }
  document.addEventListener("click", function (event) {
    const editButton = event.target.closest("[data-cms-edit]");
    if (editButton) return edit(editButton.dataset.cmsEdit);
    const deleteButton = event.target.closest("[data-cms-delete]");
    if (deleteButton) return remove(deleteButton.dataset.cmsDelete);
    if (event.target.id === "cmsClear") return clearForm();
  });
  document.addEventListener("change", function (event) {
    if (event.target.matches("[data-cms-media]")) {
      if (event.target.checked) selectedMedia.add(event.target.dataset.cmsMedia);
      else selectedMedia.delete(event.target.dataset.cmsMedia);
    }
    if (event.target.id === "cmsUpload" && event.target.files && event.target.files.length) {
      upload(event.target.files);
      event.target.value = "";
    }
  });
  document.addEventListener("submit", function (event) {
    if (event.target.id === "cmsEntryForm") save(event);
  });
  window.cmsSectionEditor = { supports: supports, load: load };
})();