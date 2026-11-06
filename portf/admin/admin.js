// Portfolio Admin CMS
// Uses only the Supabase public publishable/anon key. Never add a service-role key here.
const SUPABASE_URL = "https://lfmbvvwnrhohdifypuyw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kwoxePVR6yzu60XODZJhxg_Kngnh01x";
const MEDIA_BUCKET = "portfolio-media";

const SECTION_TITLES = {};
let discoveredMainSections = [];
let discoveredSubsections = [];

window.__portfolioSetSiteSections = function (mainSections, subsections) {
  discoveredMainSections = Array.isArray(mainSections) ? mainSections : [];
  discoveredSubsections = Array.isArray(subsections) ? subsections : [];
  discoveredMainSections.forEach(function (item) {
    if (item && item.key && item.title) SECTION_TITLES[item.key] = item.title;
  });
  discoveredSubsections.forEach(function (item) {
    if (item && item.key && item.title) SECTION_TITLES[item.key] = item.title;
  });

  const nav = document.getElementById("sectionNav");
  if (!nav) return;
  const button = function (key, title, nested) {
    return '<button class="nav-item' + (nested ? ' nav-subitem' : '') +
      '" data-section="' + escapeHtml(key) + '">' + escapeHtml(title) + '</button>';
  };
  const seen = new Set();
  let html = button("overview", "Overview", false) +
    '<div class="nav-group-label">MAIN WEBSITE</div>';
  discoveredMainSections.forEach(function (main) {
    if (!main || !main.key || seen.has(main.key)) return;
    seen.add(main.key);
    html += button(main.key, main.title, false);
    const children = discoveredSubsections.filter(function (sub) {
      return sub && sub.parentKey === main.key && !seen.has(sub.key);
    });
    children.forEach(function (sub) {
      seen.add(sub.key);
      html += button(sub.key, "↳ " + sub.title, true);
    });
  });
  const ungrouped = discoveredSubsections.filter(function (sub) {
    return sub && sub.key && !seen.has(sub.key);
  });
  if (ungrouped.length) {
    html += '<div class="nav-group-label">OTHER SUBSECTIONS</div>';
    ungrouped.forEach(function (sub) {
      seen.add(sub.key);
      html += button(sub.key, sub.title, true);
    });
  }
  html += '<div class="nav-group-label">MEDIA LIBRARY</div>' +
    button("images", "Image Library", false) + button("videos", "Video Library", false);
  nav.innerHTML = html;
};

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");
const adminEmail = document.getElementById("adminEmail");
const contentPanel = document.getElementById("contentPanel");
let supabaseClient;
let currentSection = "overview";
let currentRecords = [];
let editingId = null;
let mediaItems = [];

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
  });
}
function showLogin(message) {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginMessage.textContent = message || "";
}
function showApp(email) {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  adminEmail.textContent = email || "Administrator";
}
function setMessage(message, type) {
  const el = document.getElementById("pageMessage");
  if (!el) return;
  el.textContent = message;
  el.className = "page-message " + (type || "");
}
function configReady() {
  return SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20;
}
async function verifyAdministrator() {
  const result = await supabaseClient.auth.getUser();
  const user = result.data && result.data.user;
  if (result.error || !user) {
    showLogin("");
    return false;
  }
  const check = await supabaseClient.rpc("is_portfolio_admin");
  if (check.error || check.data !== true) {
    await supabaseClient.auth.signOut();
    showLogin("This account is not authorized to access the portfolio dashboard.");
    return false;
  }
  // Optional bootstrap: the RPC exists only after the additive multi-site migration is applied.
  // Its failure must not block the already-working legacy portfolio dashboard.
  const siteBootstrap = await supabaseClient.rpc("cms_bootstrap_portfolio_site");
  if (!siteBootstrap.error && siteBootstrap.data) {
    window.portfolioCmsSiteId = siteBootstrap.data;
  } else if (siteBootstrap.error) {
    console.info("Multi-site CMS bootstrap is not available yet; continuing with the legacy portfolio CMS.");
  }
  showApp(user.email);
  if (typeof window.syncPortfolioStructure === "function") {
    try {
      await window.syncPortfolioStructure();
      if (window.portfolioCmsSiteId) {
        await syncCmsStructure();
      }
    } catch (structureError) {
      console.warn("Website structure sync failed; keeping the existing admin navigation.", structureError);
    }
  }
  await renderSection("overview");
  return true;
}
function setActiveNavigation(section) {
  document.querySelectorAll(".nav-item").forEach(function (button) {
    const active = button.dataset.section === section;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}
function sectionHeader(title, description, action) {
  return '<div class="section-heading"><div><h2>' + escapeHtml(title) + '</h2><p>' +
    escapeHtml(description) + '</p></div>' + (action || "") + '</div>';
}

async function syncCmsStructure() {
  const siteId = window.portfolioCmsSiteId;
  if (!siteId || !supabaseClient) return;

  // Keep a single Home page for the current portfolio while mirroring its
  // discovered main sections and nested topics into the multi-site schema.
  let pageResult = await supabaseClient.from("cms_pages")
    .select("id").eq("site_id", siteId).eq("slug", "home").maybeSingle();
  if (pageResult.error) throw pageResult.error;

  let pageId = pageResult.data && pageResult.data.id;
  if (!pageId) {
    const createdPage = await supabaseClient.from("cms_pages").insert({
      site_id: siteId, slug: "home", title: "Home", status: "published", sort_order: 0
    }).select("id").single();
    if (createdPage.error) throw createdPage.error;
    pageId = createdPage.data.id;
  }

  const existingResult = await supabaseClient.from("cms_sections")
    .select("id,section_key,title,sort_order,parent_section_id")
    .eq("site_id", siteId).eq("page_id", pageId);
  if (existingResult.error) throw existingResult.error;

  const existingByKey = new Map((existingResult.data || []).map(function (item) {
    return [item.section_key, item];
  }));
  const sectionIds = new Map();

  async function saveSection(item, parentSectionId, order, type) {
    if (!item || !item.key || !item.title) return;
    const existing = existingByKey.get(item.key);
    if (existing) {
      const updated = await supabaseClient.from("cms_sections").update({
        title: item.title,
        sort_order: order,
        parent_section_id: parentSectionId || null
      }).eq("id", existing.id);
      if (updated.error) throw updated.error;
      sectionIds.set(item.key, existing.id);
      return;
    }
    const inserted = await supabaseClient.from("cms_sections").insert({
      site_id: siteId,
      page_id: pageId,
      parent_section_id: parentSectionId || null,
      section_key: item.key,
      title: item.title,
      section_type: type,
      layout_key: "default",
      field_schema: { type: "object", fields: [] },
      status: "published",
      sort_order: order
    }).select("id").single();
    if (inserted.error) throw inserted.error;
    sectionIds.set(item.key, inserted.data.id);
  }

  for (let i = 0; i < discoveredMainSections.length; i += 1) {
    await saveSection(discoveredMainSections[i], null, i, "main");
  }
  for (let i = 0; i < discoveredSubsections.length; i += 1) {
    const item = discoveredSubsections[i];
    const parentId = item.parentKey ? sectionIds.get(item.parentKey) : null;
    await saveSection(item, parentId, i, "subsection");
  }

  window.portfolioCmsStructureSynced = {
    pageId: pageId,
    mainSections: discoveredMainSections.length,
    subsections: discoveredSubsections.length
  };
}
function renderOverview() {
  contentPanel.innerHTML = '<div class="loading-state">Loading dashboard statistics…</div>';
  return supabaseClient.from("portfolio_content").select("id,status,section_key")
    .then(function (result) {
      if (result.error) throw result.error;
      const rows = result.data || [];
      const published = rows.filter(function (row) { return row.status === "published"; }).length;
      const drafts = rows.filter(function (row) { return row.status === "draft"; }).length;
      contentPanel.innerHTML =
        '<div class="welcome-card"><div class="welcome-icon">✦</div><div><h2>Your portfolio workspace</h2><p>Create and manage portfolio content here. New entries are saved as drafts unless you choose Published. Changes in this CMS do not automatically appear on the public website until the separate public-site integration is completed.</p></div></div>' +
        '<div class="stat-grid">' +
        '<article class="stat-card"><span>TOTAL CONTENT</span><strong>' + rows.length + '</strong><p>Records stored in Supabase</p></article>' +
        '<article class="stat-card"><span>PUBLISHED</span><strong>' + published + '</strong><p>Marked as published in the database</p></article>' +
        '<article class="stat-card"><span>DRAFTS</span><strong>' + drafts + '</strong><p>Saved but not published</p></article></div>' +
        '<div class="notice"><strong>Publishing status</strong><p>Database publishing status is not the same as public website deployment. We will connect the public portfolio after the CMS is tested.</p></div>' +
        '<div class="quick-links"><h3>Manage a section</h3><div class="quick-grid">' +
        Object.keys(SECTION_TITLES).map(function (key) {
          return '<button class="quick-link" data-go-section="' + key + '">' + escapeHtml(SECTION_TITLES[key]) + ' <span>→</span></button>';
        }).join("") + '</div></div>';
    })
    .catch(function (error) {
      contentPanel.innerHTML = '<div class="notice error"><strong>Could not load dashboard statistics</strong><p>' +
        escapeHtml(error.message || "Please check your Supabase permissions.") + '</p><button class="secondary-button" id="retryOverview">Try again</button></div>';
    });
}
async function loadContentSection(section) {
  contentPanel.innerHTML = '<div class="loading-state">Loading ' + escapeHtml(SECTION_TITLES[section]) + '…</div>';
  const result = await supabaseClient.from("portfolio_content").select("*")
    .eq("section_key", section).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  if (result.error) throw result.error;
  currentRecords = result.data || [];
  editingId = null;
  renderContentSection(section);
}
function renderContentSection(section) {
  const title = SECTION_TITLES[section];
  contentPanel.innerHTML =
    sectionHeader(title, "Create, edit, save as draft, or mark records as published.",
      '<button class="primary-button" id="newRecordButton">+ Add entry</button>') +
    '<div id="pageMessage" class="page-message" role="status"></div>' +
    '<div class="editor-layout"><div class="record-list"><h3>Entries (' + currentRecords.length + ')</h3>' +
    (currentRecords.length ? currentRecords.map(function (record) {
      return '<article class="record-card"><div class="record-card-top"><strong>' + escapeHtml(record.title) +
        '</strong><span class="status-pill ' + escapeHtml(record.status) + '">' + escapeHtml(record.status) +
        '</span></div><p>' + escapeHtml(record.slug || "No slug") + '</p><div class="record-actions">' +
        '<button class="secondary-button" data-edit-record="' + record.id + '">Edit</button>' +
        '<button class="danger-button" data-delete-record="' + record.id + '">Delete</button></div></article>';
    }).join("") : '<p class="empty-state">No entries in this section yet. Select Add entry to create one.</p>') +
    '</div><form id="recordForm" class="editor-form"><h3 id="editorTitle">New entry</h3>' +
    '<label>Title<input id="recordTitle" required maxlength="180" placeholder="Entry title"></label>' +
    '<label>Slug (optional)<input id="recordSlug" maxlength="180" placeholder="example-entry"></label>' +
    `<label>Content (JSON)<textarea id="recordContent" rows="9" spellcheck="false">{
  "description": ""
}</textarea><small>Use valid JSON. You can add fields such as description, image, date, role, or links.</small></label>` +
    '<div class="form-row"><label>Status<select id="recordStatus"><option value="draft">Draft (not public)</option></select></label>' +
    '<label>Sort order<input id="recordSort" type="number" value="0"></label></div>' +
    '<div class="form-actions"><button class="primary-button" type="submit">Save Draft</button><button class="secondary-button" type="button" id="previewRecordButton">Preview</button><button class="secondary-button" type="button" id="cancelEditButton">Clear</button></div>' +
    '<div id="previewPanel" class="preview-panel" aria-live="polite"></div>' +
    '<p class="form-hint">Preview before publishing. Publishing changes the database status only; it does not deploy or change the public website.</p></form></div>';
}
function clearEditor() {
  editingId = null;
  const form = document.getElementById("recordForm");
  if (form) form.reset();
  const title = document.getElementById("editorTitle");
  if (title) title.textContent = "New entry";
  const sort = document.getElementById("recordSort");
  if (sort) sort.value = "0";
  const json = document.getElementById("recordContent");
  if (json) json.value = `{
  "description": ""
}`;
  const preview = document.getElementById("previewPanel");
  if (preview) preview.innerHTML = "";
}
function editRecord(id) {
  const record = currentRecords.find(function (item) { return item.id === id; });
  if (!record) return;
  editingId = id;
  const preview = document.getElementById("previewPanel");
  if (preview) preview.innerHTML = "";
  document.getElementById("editorTitle").textContent = "Edit entry";
  document.getElementById("recordTitle").value = record.title || "";
  document.getElementById("recordSlug").value = record.slug || "";
  document.getElementById("recordContent").value = JSON.stringify(record.content || {}, null, 2);
  document.getElementById("recordStatus").value = record.status || "draft";
  document.getElementById("recordSort").value = record.sort_order || 0;
  document.getElementById("recordTitle").focus();
}
function safePreviewUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch (_error) { return ""; }
}
function previewValue(value) {
  if (Array.isArray(value)) {
    return '<ul class="visual-preview-list">' + value.map(function (item) {
      return '<li>' + escapeHtml(typeof item === "object" ? JSON.stringify(item) : item) + '</li>';
    }).join("") + '</ul>';
  }
  if (value && typeof value === "object") {
    return '<dl class="visual-preview-details">' + Object.keys(value).map(function (key) {
      return '<div><dt>' + escapeHtml(key.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ")) +
        '</dt><dd>' + escapeHtml(typeof value[key] === "object" ? JSON.stringify(value[key]) : value[key]) + '</dd></div>';
    }).join("") + '</dl>';
  }
  return '<p class="visual-preview-text">' + escapeHtml(value) + '</p>';
}
function previewRecord() {
  const title = document.getElementById("recordTitle").value.trim();
  let content;
  try { content = JSON.parse(document.getElementById("recordContent").value || "{}"); }
  catch (error) { setMessage("Content must be valid JSON: " + error.message, "error"); return; }
  if (!title) { setMessage("Add a title before previewing.", "error"); return; }
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    setMessage("Content must be a JSON object so it can be previewed.", "error"); return;
  }
  const panel = document.getElementById("previewPanel");
  const description = content.description || content.summary || content.text || "";
  const subtitle = content.subtitle || content.role || content.category || "";
  const imageUrl = safePreviewUrl(content.image || content.imageUrl || content.image_url || "");
  const image = imageUrl
    ? '<img class="visual-preview-image" src="' + escapeHtml(imageUrl) + '" alt="' +
      escapeHtml(content.imageAlt || content.image_alt || title) + '">'
    : "";
  const known = new Set(["description","summary","text","subtitle","role","category","image","imageUrl","image_url","imageAlt","image_alt"]);
  const extraKeys = Object.keys(content).filter(function (key) { return !known.has(key); });
  const extras = extraKeys.map(function (key) {
    const label = key.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ");
    return '<section class="visual-preview-field"><h5>' + escapeHtml(label) + '</h5>' +
      previewValue(content[key]) + '</section>';
  }).join("");
  panel.innerHTML =
    '<article class="visual-preview-card">' + image +
    '<div class="visual-preview-body"><div class="preview-label">VISUAL CONTENT PREVIEW · ' +
    escapeHtml(SECTION_TITLES[currentSection] || "PORTFOLIO") + '</div><h4>' + escapeHtml(title) + '</h4>' +
    (subtitle ? '<p class="visual-preview-subtitle">' + escapeHtml(subtitle) + '</p>' : '') +
    (description ? '<p class="visual-preview-description">' + escapeHtml(description) + '</p>' : '') +
    extras + '</div></article>' +
    '<div class="preview-publish"><button class="primary-button" type="button" id="confirmPublishButton">Confirm Publish</button>' +
    '<p>Review this visual content preview. Confirming marks this entry as published in Supabase; it does not deploy or change the public website.</p></div>';
  setMessage("Visual preview ready. Review it before confirming publication.", "success");
}
async function saveRecord(event, statusOverride) {
  if (event && event.preventDefault) event.preventDefault();
  const title = document.getElementById("recordTitle").value.trim();
  const slug = document.getElementById("recordSlug").value.trim() || null;
  let content;
  try { content = JSON.parse(document.getElementById("recordContent").value || "{}"); }
  catch (error) { setMessage("Content must be valid JSON: " + error.message, "error"); return; }
  const payload = {
    section_key: currentSection,
    title: title,
    slug: slug,
    content: content,
    status: statusOverride || "draft",
    sort_order: Number(document.getElementById("recordSort").value || 0),
    updated_at: new Date().toISOString()
  };
  if (payload.status === "published") payload.published_at = new Date().toISOString();
  else payload.published_at = null;
  const result = editingId
    ? await supabaseClient.from("portfolio_content").update(payload).eq("id", editingId)
    : await supabaseClient.from("portfolio_content").insert(payload);
  if (result.error) { setMessage("Save failed: " + result.error.message, "error"); return; }
  setMessage("Entry saved successfully.", "success");
  await loadContentSection(currentSection);
}
async function deleteRecord(id) {
  const record = currentRecords.find(function (item) { return item.id === id; });
  if (!record || !window.confirm('Delete "' + record.title + '"? This cannot be undone.')) return;
  const result = await supabaseClient.from("portfolio_content").delete().eq("id", id);
  if (result.error) { setMessage("Delete failed: " + result.error.message, "error"); return; }
  await loadContentSection(currentSection);
}
function mediaType(name) {
  return /\.(mp4|mov|webm|m4v)$/i.test(name) ? "videos" : "images";
}
async function loadMedia(section) {
  contentPanel.innerHTML = '<div class="loading-state">Loading media library…</div>';
  const result = await supabaseClient.storage.from(MEDIA_BUCKET).list("", {
    limit: 100, sortBy: { column: "created_at", order: "desc" }
  });
  if (result.error) throw result.error;
  mediaItems = (result.data || []).filter(function (item) { return item.name && item.name !== ".emptyFolderPlaceholder"; })
    .filter(function (item) { return mediaType(item.name) === section; });
  const cards = await Promise.all(mediaItems.map(async function (item) {
    const signed = await supabaseClient.storage.from(MEDIA_BUCKET).createSignedUrl(item.name, 3600);
    return { item: item, url: signed.data ? signed.data.signedUrl : "", error: signed.error };
  }));
  const isVideo = section === "videos";
  contentPanel.innerHTML = sectionHeader(isVideo ? "Video Library" : "Image Library",
    "Upload and manage files stored in your private portfolio-media bucket.",
    '<label class="upload-button">+ Upload ' + (isVideo ? "video" : "image") +
    '<input id="mediaUpload" type="file" accept="' + (isVideo ? "video/*" : "image/*") + '" multiple hidden></label>') +
    '<div id="pageMessage" class="page-message" role="status"></div>' +
    '<div class="media-grid">' + (cards.length ? cards.map(function (entry) {
      const name = entry.item.name;
      const preview = entry.url ? (isVideo
        ? '<video controls preload="metadata" src="' + escapeHtml(entry.url) + '"></video>'
        : '<img loading="lazy" src="' + escapeHtml(entry.url) + '" alt="' + escapeHtml(name) + '">')
        : '<div class="media-unavailable">Preview unavailable</div>';
      return '<article class="media-card">' + preview + '<div class="media-meta"><strong>' + escapeHtml(name) +
        '</strong><div class="record-actions">' +
        (entry.url ? '<button class="secondary-button" data-preview-media="' + escapeHtml(name) +
          '" data-preview-url="' + escapeHtml(entry.url) + '" data-preview-type="' + (isVideo ? 'video' : 'image') +
          '">Preview</button>' : '') +
        '<button class="danger-button" data-delete-media="' + escapeHtml(name) + '">Delete</button></div></div></article>';
    }).join("") : '<p class="empty-state">No ' + (isVideo ? "videos" : "images") + ' uploaded yet.</p>') + '</div>';
}
function openMediaPreview(url, name, type) {
  if (!url) return;
  const media = type === "video"
    ? '<video class="media-preview-large" controls autoplay src="' + escapeHtml(url) + '"></video>'
    : '<img class="media-preview-large" src="' + escapeHtml(url) + '" alt="' + escapeHtml(name || "Portfolio image") + '">';
  const existing = document.getElementById("mediaPreviewModal");
  if (existing) existing.remove();
  document.body.insertAdjacentHTML("beforeend",
    '<div class="media-preview-modal" id="mediaPreviewModal">' +
    '<div class="media-preview-backdrop" id="mediaPreviewBackdrop"></div>' +
    '<section class="media-preview-dialog" role="dialog" aria-modal="true" aria-label="Media preview">' +
    '<div class="media-preview-heading"><strong>' + escapeHtml(name || "Media preview") +
    '</strong><button class="secondary-button" type="button" id="mediaPreviewClose">Close</button></div>' +
    media + '</section></div>');
  const modal = document.getElementById("mediaPreviewModal");
  function closePreview() {
    const video = modal.querySelector("video");
    if (video) video.pause();
    modal.remove();
  }
  modal.querySelector("#mediaPreviewClose").addEventListener("click", closePreview);
  modal.querySelector("#mediaPreviewBackdrop").addEventListener("click", closePreview);
  document.addEventListener("keydown", function handlePreviewEscape(event) {
    if (event.key === "Escape" && document.getElementById("mediaPreviewModal") === modal) {
      closePreview();
      document.removeEventListener("keydown", handlePreviewEscape);
    }
  });
}

async function uploadMedia(files) {
  for (const file of Array.from(files)) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "-" + safeName;
    const result = await supabaseClient.storage.from(MEDIA_BUCKET).upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type || undefined
    });
    if (result.error) { setMessage("Upload failed for " + file.name + ": " + result.error.message, "error"); return; }
  }
  await loadMedia(currentSection);
  setMessage("Upload completed.", "success");
}
async function deleteMedia(name) {
  if (!window.confirm('Delete "' + name + '" from the media library?')) return;
  const result = await supabaseClient.storage.from(MEDIA_BUCKET).remove([name]);
  if (result.error) { setMessage("Delete failed: " + result.error.message, "error"); return; }
  await loadMedia(currentSection);
}
async function renderSection(section) {
  currentSection = section;
  setActiveNavigation(section);
  const title = section === "overview" ? "Overview" :
    section === "images" ? "Image Library" : section === "videos" ? "Video Library" : SECTION_TITLES[section];
  document.getElementById("pageTitle").textContent = title || "Overview";
  if (section === "overview") return renderOverview();
  try {
    if (section === "images" || section === "videos") await loadMedia(section);
    else if (SECTION_TITLES[section]) await loadContentSection(section);
  } catch (error) {
    contentPanel.innerHTML = '<div class="notice error"><strong>Could not load this section</strong><p>' +
      escapeHtml(error.message || "Unknown error") + '</p><button class="secondary-button" id="retrySection">Try again</button></div>';
  }
}
document.getElementById("sectionNav").addEventListener("click", function (event) {
  const button = event.target.closest("button[data-section]");
  if (button) renderSection(button.dataset.section);
});
contentPanel.addEventListener("click", function (event) {
  const go = event.target.closest("[data-go-section]");
  if (go) return renderSection(go.dataset.goSection);
  const edit = event.target.closest("[data-edit-record]");
  if (edit) return editRecord(edit.dataset.editRecord);
  const del = event.target.closest("[data-delete-record]");
  if (del) return deleteRecord(del.dataset.deleteRecord);
  const mediaPreview = event.target.closest("[data-preview-media]");
  if (mediaPreview) return openMediaPreview(mediaPreview.dataset.previewUrl, mediaPreview.dataset.previewMedia, mediaPreview.dataset.previewType);
  if (event.target.id === "mediaPreviewClose" || event.target.id === "mediaPreviewBackdrop") {
    const modal = document.getElementById("mediaPreviewModal");
    if (modal) modal.remove();
    return;
  }
  const mediaDel = event.target.closest("[data-delete-media]");
  if (mediaDel) return deleteMedia(mediaDel.dataset.deleteMedia);
  if (event.target.id === "newRecordButton") return clearEditor();
  if (event.target.id === "cancelEditButton") return clearEditor();
  if (event.target.id === "previewRecordButton") return previewRecord();
  if (event.target.id === "confirmPublishButton") return saveRecord(null, "published");
  if (event.target.id === "retryOverview") return renderOverview();
  if (event.target.id === "retrySection") return renderSection(currentSection);
});
contentPanel.addEventListener("input", function (event) {
  if (event.target.closest("#recordForm")) {
    const preview = document.getElementById("previewPanel");
    if (preview) preview.innerHTML = "";
  }
});
contentPanel.addEventListener("submit", function (event) {
  if (event.target.id === "recordForm") saveRecord(event);
});
contentPanel.addEventListener("change", function (event) {
  if (event.target.id === "mediaUpload" && event.target.files && event.target.files.length) {
    uploadMedia(event.target.files);
    event.target.value = "";
  }
});
loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!supabaseClient) return;
  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";
  loginMessage.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const result = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
  if (result.error) loginMessage.textContent = "Sign-in failed. Check your email and password, then try again.";
  else await verifyAdministrator();
  loginButton.disabled = false;
  loginButton.textContent = "Sign in";
});
document.getElementById("logoutButton").addEventListener("click", async function () {
  if (supabaseClient) await supabaseClient.auth.signOut();
  showLogin("You have signed out.");
});
async function start() {
  if (!configReady()) { showLogin("Supabase setup is incomplete."); loginButton.disabled = true; return; }
  if (!window.supabase || !window.supabase.createClient) {
    showLogin("Supabase library could not load. Check your connection and refresh.");
    return;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const sessionResult = await supabaseClient.auth.getSession();
  if (sessionResult.data && sessionResult.data.session) await verifyAdministrator();
  else showLogin("");
  supabaseClient.auth.onAuthStateChange(function (_event, session) {
    if (!session) showLogin("");
  });
}
start();