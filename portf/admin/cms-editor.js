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
    // Every discovered main section and subsection uses the same CMS editor.
    // Legacy records are still loaded alongside CMS records for compatibility.
    return !!siteId() && !!key && key !== "overview" && key !== "images" && key !== "videos";
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
      const [contentResult, mediaResult, legacyResult] = await Promise.all([
        client().from("cms_content").select("*").eq("site_id", siteId()).eq("section_id", section.id)
          .order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
        client().from("cms_media").select("*").eq("site_id", siteId()).eq("section_id", section.id)
          .order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
        client().from("portfolio_content").select("*").eq("section_key", key)
          .order("sort_order", { ascending: true }).order("created_at", { ascending: false })
      ]);
      if (contentResult.error) throw contentResult.error;
      if (mediaResult.error) throw mediaResult.error;
      if (legacyResult.error) throw legacyResult.error;
      const cmsRecords = (contentResult.data || [])
        .filter(function (row) { return !(row.payload && row.payload.resource_kind); })
        .map(function (row) { return Object.assign({}, row, { _source: "cms" }); });
      const legacyRecords = (legacyResult.data || []).map(function (row) {
        return Object.assign({}, row, {
          _source: "legacy",
          payload: row.content && typeof row.content === "object" ? row.content : {}
        });
      });
      activeRecords = cmsRecords.concat(legacyRecords).sort(function (a, b) {
        return Number(a.sort_order || 0) - Number(b.sort_order || 0);
      });
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
        '<p>' + esc(payload.subtitle || payload.role || payload.category || payload.description || payload.summary || payload.text || "No description") + '</p>' +
        (record._source === "legacy" ? '<p class="cms-help">Existing portfolio content · compatibility mode</p>' : '<p class="cms-help">CMS entry</p>') +
        '<div class="record-actions"><button class="secondary-button" data-cms-edit="' + esc(record.id) + '">Edit</button>' +
        '<button class="danger-button" data-cms-delete="' + esc(record.id) + '">Delete</button></div></article>';
    }).join("");
    const media = activeMedia.map(function (item) {
      const row = item.row, checked = selectedMedia.has(row.id) ? " checked" : "";
      const preview = item.url && row.media_type === "video"
        ? '<video controls preload="metadata" src="' + esc(item.url) + '"></video>'
        : item.url && row.media_type === "image"
          ? '<img loading="lazy" src="' + esc(item.url) + '" alt="' + esc(row.alt_text || row.title) + '">'
          : '<div class="media-file-placeholder"><strong>' + esc(row.media_type || "file").toUpperCase() +
            '</strong><span>' + esc(row.title || "Uploaded file") + '</span></div>';
      return '<div class="cms-media-item">' + preview +
        '<div class="cms-media-actions">' +
        ((item.url && (row.media_type === "image" || row.media_type === "video"))
          ? '<button class="secondary-button" type="button" data-preview-media="' +
            esc(row.title || "Uploaded media") + '" data-preview-url="' + esc(item.url) +
            '" data-preview-type="' + row.media_type + '">Preview</button>' : '') +
        '<label><input type="checkbox" data-cms-media="' +
        esc(row.id) + '"' + checked + '> Attach to entry</label></div></div>';
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
      '<label>Additional details / paragraphs<textarea id="cmsParagraphs" rows="4" placeholder="Add one paragraph per line (optional)"></textarea></label>' +
      '<label>Attach images or videos<input id="cmsUpload" type="file" accept="image/*,video/*" multiple></label>' +
      '<p class="cms-help">Uploaded files stay in the private CMS media bucket and are associated with this section. Select the media below to attach it to this entry.</p>' +
      '<div class="form-row"><label>Status<select id="cmsStatus"><option value="draft">Draft (private)</option><option value="published">Published (visible on website)</option></select></label>' +
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
    const paragraphs = document.getElementById("cmsParagraphs");
    if (paragraphs) paragraphs.value = "";
    document.querySelectorAll("[data-cms-media]").forEach(function (box) { box.checked = false; });
  }
  function edit(id) {
    const record = activeRecords.find(function (item) { return item.id === id; });
    if (!record) return;
    editingContentId = id;
    const payload = record.payload || {};
    document.getElementById("cmsFormTitle").textContent = "Edit entry";
    document.getElementById("cmsTitle").value = record.title || "";
    document.getElementById("cmsSubtitle").value = payload.subtitle || payload.role || payload.category || "";
    document.getElementById("cmsDescription").value = payload.description || payload.summary || payload.text || "";
    document.getElementById("cmsParagraphs").value = Array.isArray(payload.paragraphs) ? payload.paragraphs.join("\n") : "";
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
    const status = document.getElementById("cmsStatus").value === "published" ? "published" : "draft";
    const previous = activeRecords.find(function (row) { return row.id === editingContentId; });
    const paragraphs = document.getElementById("cmsParagraphs").value
      .split("\n").map(function (line) { return line.trim(); }).filter(Boolean);
    const payload = Object.assign({}, previous && previous.payload ? previous.payload : {}, {
      subtitle: document.getElementById("cmsSubtitle").value.trim(),
      description: document.getElementById("cmsDescription").value.trim(),
      paragraphs: paragraphs
    });
    if (!previous || previous._source !== "legacy") {
      payload.media_ids = Array.from(selectedMedia);
    }
    const previousMediaIds = previous && previous.payload && Array.isArray(previous.payload.media_ids)
      ? previous.payload.media_ids : [];
    const mediaToPublish = previous && previous._source === "legacy" ? [] :
      activeMedia.filter(function (item) {
        return selectedMedia.has(item.row.id) && item.row.status !== "published";
      }).map(function (item) { return item.row.id; });
    if (status === "published" && mediaToPublish.length) {
      const mediaUpdate = await client().from("cms_media").update({
        status: "published", published_at: new Date().toISOString()
      }).eq("site_id", siteId()).in("id", mediaToPublish);
      if (mediaUpdate.error) {
        message("Media could not be published: " + mediaUpdate.error.message, "error");
        return;
      }
    }
    const sortOrder = Number(document.getElementById("cmsSort").value || 0);
    const result = previous && previous._source === "legacy"
      ? await client().from("portfolio_content").update({
          title: title,
          content: payload,
          status: status,
          sort_order: sortOrder,
          updated_at: new Date().toISOString(),
          published_at: status === "published" ? new Date().toISOString() : null
        }).eq("id", editingContentId)
      : await (editingContentId
          ? client().from("cms_content").update({
              site_id: siteId(), page_id: (window.portfolioCmsStructureSynced || {}).pageId,
              section_id: activeSectionId, title: title, slug: null, payload: payload,
              status: status, sort_order: sortOrder,
              published_at: status === "published" ? new Date().toISOString() : null
            }).eq("id", editingContentId)
          : client().from("cms_content").insert({
              site_id: siteId(), page_id: (window.portfolioCmsStructureSynced || {}).pageId,
              section_id: activeSectionId, title: title, slug: null, payload: payload,
              status: status, sort_order: sortOrder,
              published_at: status === "published" ? new Date().toISOString() : null
            }));
    if (result.error) {
      if (mediaToPublish.length) {
        await client().from("cms_media").update({ status: "draft", published_at: null })
          .eq("site_id", siteId()).in("id", mediaToPublish);
      }
      message("Save failed: " + result.error.message, "error");
      return;
    }

    // If an entry is moved back to draft, unpublish its old media only when no
    // other published entry in this site still references those files.
    if (status === "draft" && previous && previous.status === "published" && previousMediaIds.length) {
      const remaining = await client().from("cms_content").select("id,payload")
        .eq("site_id", siteId()).eq("status", "published");
      if (!remaining.error) {
        const stillUsed = new Set();
        (remaining.data || []).forEach(function (row) {
          (row.payload && Array.isArray(row.payload.media_ids) ? row.payload.media_ids : [])
            .forEach(function (id) { stillUsed.add(id); });
        });
        const safeToDraft = previousMediaIds.filter(function (id) {
          return !stillUsed.has(id);
        });
        if (safeToDraft.length) {
          await client().from("cms_media").update({ status: "draft", published_at: null })
            .eq("site_id", siteId()).in("id", safeToDraft);
        }
      }
    }
    await load(activeSection);
    message(status === "published" ? "Entry published on the website." : "Entry saved as a private draft.", "success");
  }
  async function remove(id) {
    const row = activeRecords.find(function (item) { return item.id === id; });
    if (!row || !window.confirm('Delete "' + row.title + '"?')) return;
    const result = row._source === "legacy"
      ? await client().from("portfolio_content").delete().eq("id", id)
      : await client().from("cms_content").delete().eq("id", id);
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