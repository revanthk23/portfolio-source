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
  Object.keys(SECTION_TITLES).forEach(function (key) { delete SECTION_TITLES[key]; });
  discoveredMainSections.concat(discoveredSubsections).forEach(function (item) {
    if (item && item.key && item.title) SECTION_TITLES[item.key] = item.title;
  });

  const nav = document.getElementById("sectionNav");
  if (!nav) return;
  const button = function (key, title, depth) {
    return '<button class="nav-item' + (depth ? ' nav-subitem nav-depth-' + Math.min(depth, 5) : '') +
      '" data-section="' + escapeHtml(key) + '">' + (depth ? '↳ ' : '') + escapeHtml(title) + '</button>';
  };
  const children = new Map();
  discoveredSubsections.forEach(function (item) {
    const parent = item && item.parentKey ? item.parentKey : "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(item);
  });
  const seen = new Set();
  let html = button("overview", "Overview", 0) +
    button("section-manager", "Section Manager", 0) +
    '<div class="nav-group-label">MAIN WEBSITE</div>';
  function appendChildren(parentKey, depth) {
    (children.get(parentKey) || []).forEach(function (item) {
      if (!item || !item.key || seen.has(item.key)) return;
      seen.add(item.key);
      html += button(item.key, item.title || item.key, depth);
      appendChildren(item.key, depth + 1);
    });
  }
  discoveredMainSections.forEach(function (main) {
    if (!main || !main.key || seen.has(main.key)) return;
    seen.add(main.key);
    html += button(main.key, main.title || main.key, 0);
    appendChildren(main.key, 1);
  });
  discoveredSubsections.forEach(function (item) {
    if (!item || !item.key || seen.has(item.key)) return;
    seen.add(item.key);
    html += button(item.key, item.title || item.key, 1);
    appendChildren(item.key, 2);
  });
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

  showApp(user.email);
  contentPanel.innerHTML = '<div class="loading-state">Connecting the portfolio content management system…</div>';
  document.getElementById("pageTitle").textContent = "Portfolio workspace";
  const siteBootstrap = await supabaseClient.rpc("cms_bootstrap_portfolio_site");
  if (siteBootstrap.error || !siteBootstrap.data) {
    const reason = siteBootstrap.error && siteBootstrap.error.message
      ? siteBootstrap.error.message : "The CMS site could not be initialized.";
    contentPanel.innerHTML =
      '<div class="notice error"><strong>Portfolio CMS connection needs attention</strong>' +
      '<p>The dashboard could not connect to the approved main-website CMS. The older fallback editor is intentionally disabled so it does not look like the completed dashboard or save content into the wrong system.</p>' +
      '<p><strong>Connection detail:</strong> ' + escapeHtml(reason) + '</p>' +
      '<p>Existing website content has not been changed. Check that the portfolio CMS migrations and administrator membership are present in the connected Supabase project, then refresh this page.</p>' +
      '<button class="secondary-button" id="retryCmsConnection" type="button">Retry connection</button></div>';
    return false;
  }
  window.portfolioCmsSiteId = siteBootstrap.data;
  try {
    if (typeof window.syncPortfolioStructure !== "function") {
      throw new Error("The website structure discovery module did not load.");
    }
    const discovered = await window.syncPortfolioStructure();
    if (!discovered || !discovered.mainSections || !discovered.mainSections.length) {
      throw new Error("No main website sections were discovered. Check the public portfolio page structure.");
    }
    await syncCmsStructure();
    await restoreNavigationFromCms();
    await renderSection("overview");
    return true;
  } catch (error) {
    console.error("Portfolio CMS initialization failed.", error);
    contentPanel.innerHTML =
      '<div class="notice error"><strong>Could not prepare the main-website dashboard</strong><p>' +
      escapeHtml(error.message || "Unknown initialization error") +
      '</p><p>Your existing website content remains untouched. Retry after checking the CMS connection.</p>' +
      '<button class="secondary-button" id="retryCmsConnection" type="button">Retry initialization</button></div>';
    return false;
  }
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
      // Discovery may refresh the parent relationship, but must not overwrite
      // titles, visibility, or manual ordering set in the Section Manager.
      const updated = await supabaseClient.from("cms_sections").update({
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

  // Save nested topics parent-first, independent of their order in the HTML.
  const pending = discoveredSubsections.slice();
  const savedKeys = new Set(discoveredMainSections.map(function (item) { return item.key; }));
  let passes = 0;
  while (pending.length && passes <= discoveredSubsections.length) {
    passes += 1;
    let progressed = false;
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const item = pending[i];
      if (item.parentKey && !savedKeys.has(item.parentKey)) continue;
      const parentId = item.parentKey ? sectionIds.get(item.parentKey) : null;
      await saveSection(item, parentId, discoveredSubsections.indexOf(item), "subsection");
      savedKeys.add(item.key);
      pending.splice(i, 1);
      progressed = true;
    }
    if (!progressed) break;
  }
  if (pending.length) {
    const unresolved = pending.map(function (item) { return item.key + " → " + (item.parentKey || "no parent"); });
    throw new Error("Some nested subsections could not be linked to their parent: " + unresolved.join(", "));
  }

  window.portfolioCmsStructureSynced = {
    pageId: pageId,
    mainSections: discoveredMainSections.length,
    subsections: discoveredSubsections.length
  };
}
window.portfolioRefreshCmsNavigation = restoreNavigationFromCms;

async function restoreNavigationFromCms() {
  if (!window.portfolioCmsSiteId || !supabaseClient) return;
  const page = await supabaseClient.from("cms_pages")
    .select("id").eq("site_id", window.portfolioCmsSiteId).eq("slug", "home").maybeSingle();
  if (page.error) throw page.error;
  if (!page.data) return;
  const result = await supabaseClient.from("cms_sections")
    .select("id,section_key,title,parent_section_id,sort_order")
    .eq("site_id", window.portfolioCmsSiteId).eq("page_id", page.data.id)
    .order("sort_order", { ascending: true });
  if (result.error) throw result.error;
  const rows = result.data || [];
  if (!rows.length) return;
  const byId = new Map(rows.map(function (row) { return [row.section_key, row]; }));
  const mainSections = rows.filter(function (row) { return !row.parent_section_id; })
    .map(function (row) { return { key: row.section_key, title: row.title }; });
  const subsections = rows.filter(function (row) { return !!row.parent_section_id; })
    .map(function (row) {
      const parent = rows.find(function (candidate) {
        return candidate.id === row.parent_section_id;
      });
      return {
        key: row.section_key,
        title: row.title,
        parentKey: parent ? parent.section_key : null
      };
    });
  if (mainSections.length && typeof window.__portfolioSetSiteSections === "function") {
    window.__portfolioSetSiteSections(mainSections, subsections);
  }
  window.portfolioCmsStructureSynced = {
    pageId: page.data.id,
    mainSections: mainSections.length,
    subsections: subsections.length
  };
}
async function renderOverview() {
  contentPanel.innerHTML = '<div class="loading-state">Loading your portfolio workspace…</div>';
  const siteId = window.portfolioCmsSiteId;
  if (!siteId) {
    contentPanel.innerHTML = '<div class="notice error"><strong>CMS connection unavailable</strong><p>Reconnect the portfolio CMS to manage the main website.</p></div>';
    return;
  }
  try {
    const results = await Promise.all([
      supabaseClient.from("cms_sections").select("id,section_key,title,parent_section_id,status,sort_order")
        .eq("site_id", siteId).order("sort_order", { ascending: true }),
      supabaseClient.from("cms_content").select("id,status").eq("site_id", siteId),
      supabaseClient.from("cms_media").select("id,status,media_type").eq("site_id", siteId)
    ]);
    for (const result of results) if (result.error) throw result.error;
    const sections = results[0].data || [];
    const cmsEntries = results[1].data || [];
    const media = results[2].data || [];
    const published = cmsEntries.filter(row => row.status === "published").length;
    const drafts = cmsEntries.filter(row => row.status === "draft").length;
    const mainSections = sections.filter(row => !row.parent_section_id);
    const childCount = sections.length - mainSections.length;
    const cards = mainSections.map(function (section) {
      const descendants = sections.filter(function (row) {
        let parent = row.parent_section_id;
        while (parent) {
          if (parent === section.id) return true;
          const match = sections.find(item => item.id === parent);
          parent = match ? match.parent_section_id : null;
        }
        return false;
      });
      return '<button class="dashboard-section-card" type="button" data-go-section="' + escapeHtml(section.section_key) + '">' +
        '<span class="dashboard-section-kicker">MAIN WEBSITE SECTION</span><strong>' + escapeHtml(section.title) +
        '</strong><span>' + descendants.length + ' subsection(s) · ' + escapeHtml(section.status) +
        '</span><span class="dashboard-card-action">Manage section →</span></button>';
    }).join("");
    contentPanel.innerHTML =
      '<section class="dashboard-welcome"><div><div class="eyebrow">MAIN WEBSITE CONTENT MANAGEMENT</div>' +
      '<h2>Welcome to your portfolio workspace</h2><p>Manage the actual sections and subsections of your public portfolio. Edit content, organize media and documents, and publish updates without changing the existing website layout.</p>' +
      '<div class="dashboard-actions"><button class="primary-button" type="button" data-go-section="section-manager">Manage website structure</button>' +
      '<a class="secondary-button" href="../" target="_blank" rel="noopener">Preview public website ↗</a></div></div>' +
      '<div class="dashboard-welcome-mark">P</div></section>' +
      '<div class="dashboard-stat-grid">' +
      '<article class="dashboard-stat"><span>MAIN SECTIONS</span><strong>' + mainSections.length + '</strong><small>' + childCount + ' nested subsections</small></article>' +
      '<article class="dashboard-stat"><span>CONTENT ENTRIES</span><strong>' + cmsEntries.length + '</strong><small>' + published + ' published · ' + drafts + ' drafts</small></article>' +
      '<article class="dashboard-stat"><span>MEDIA & RESOURCES</span><strong>' + media.length + '</strong><small>Images, videos, documents, audio and files</small></article>' +
      '</div><div class="dashboard-section-heading"><div><h2>Website sections</h2><p>Select a section to edit its content and manage its resources.</p></div>' +
      '<button class="secondary-button" type="button" data-go-section="section-manager">Edit section structure</button></div>' +
      '<div class="dashboard-section-grid">' + (cards || '<p class="empty-state">No website sections were found. Use Section Manager to create the first section.</p>') + '</div>' +
      '<p class="dashboard-footnote">Drafts remain private. Publishing makes eligible content and resources available to the public portfolio. Your existing hand-built website sections remain in place.</p>';
  } catch (error) {
    contentPanel.innerHTML = '<div class="notice error"><strong>Dashboard overview could not load</strong><p>' +
      escapeHtml(error.message || "Please check your CMS permissions.") +
      '</p><button class="secondary-button" id="retryOverview" type="button">Try again</button></div>';
  }
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
}</textarea><small>Use valid JSON. Uploaded files are added to the media_files field.</small></label>` +
    '<label>Add images or videos to this entry<input id="recordMediaUpload" type="file" accept="image/*,video/*" multiple><small>Files are uploaded to the existing private storage and attached to this entry when saved.</small></label>' +
    '<div id="recordMediaStatus" class="form-hint" role="status"></div>' +
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
async function uploadRecordMedia(files) {
  const status = document.getElementById("recordMediaStatus");
  const field = document.getElementById("recordContent");
  if (!field) return;
  let content;
  try { content = JSON.parse(field.value || "{}"); }
  catch (_error) {
    if (status) status.textContent = "Please correct the Content JSON before uploading files.";
    return;
  }
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    if (status) status.textContent = "Content must be a JSON object before adding media.";
    return;
  }
  if (!Array.isArray(content.media_files)) content.media_files = [];
  if (status) status.textContent = "Uploading files…";
  for (const file of Array.from(files || [])) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "-" + safeName;
    const result = await supabaseClient.storage.from(MEDIA_BUCKET).upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type || undefined
    });
    if (result.error) {
      if (status) status.textContent = "Upload failed for " + file.name + ": " + result.error.message;
      return;
    }
    content.media_files.push({
      path: path, name: file.name,
      type: file.type.indexOf("video/") === 0 ? "video" : "image",
      mime_type: file.type || null
    });
  }
  field.value = JSON.stringify(content, null, 2);
  if (status) status.textContent = "Upload complete. Save this entry to keep the attachment references.";
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
async function mountSectionResources(section) {
  if (window.sectionResources && typeof window.sectionResources.mount === "function") {
    try {
      await window.sectionResources.mount(section);
      return;
    } catch (error) {
      console.error("Section resource manager could not mount.", error);
    }
  }
  if (!document.getElementById("sectionResources")) {
    contentPanel.insertAdjacentHTML("beforeend",
      '<section class="notice error"><strong>Section media & resources</strong>' +
      '<p>The resource manager script did not load. The section editor is still available; refresh the admin page ' +
      'and retry. No content or storage permissions were changed.</p></section>');
  }
}
async function renderSection(section) {
  currentSection = section;
  setActiveNavigation(section);
  if (section === "section-manager") {
    document.getElementById("pageTitle").textContent = "Section Manager";
    if (window.portfolioSectionManager) return window.portfolioSectionManager.render();
    contentPanel.innerHTML = '<div class="notice error"><strong>Section Manager is unavailable</strong><p>Refresh the dashboard and try again.</p></div>';
    return;
  }
  const title = section === "overview" ? "Overview" :
    section === "images" ? "Image Library" : section === "videos" ? "Video Library" : SECTION_TITLES[section];
  document.getElementById("pageTitle").textContent = title || "Overview";
  if (section === "overview") return renderOverview();
  try {
    if (section === "images" || section === "videos") {
      await loadMedia(section);
    } else if (SECTION_TITLES[section]) {
      if (!window.portfolioCmsSiteId || !window.cmsSectionEditor ||
          !window.cmsSectionEditor.supports(section)) {
        throw new Error("The main-website CMS editor is not connected. Reconnect the CMS and refresh the dashboard.");
      }
      await window.cmsSectionEditor.load(section);
      await mountSectionResources(section);
    }
  } catch (error) {
    contentPanel.innerHTML = '<div class="notice error"><strong>Could not load this website section</strong><p>' +
      escapeHtml(error.message || "Unknown error") + '</p><button class="secondary-button" id="retrySection" type="button">Try again</button></div>';
    if (SECTION_TITLES[section]) await mountSectionResources(section);
  }
}
window.portfolioAdminOpenSection = renderSection;
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
  if (event.target.id === "retryCmsConnection") return verifyAdministrator();
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
  if (event.target.id === "recordMediaUpload" && event.target.files && event.target.files.length) {
    uploadRecordMedia(event.target.files);
    event.target.value = "";
    return;
  }
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
  window.portfolioSupabaseClient = supabaseClient;
  const sessionResult = await supabaseClient.auth.getSession();
  if (sessionResult.data && sessionResult.data.session) await verifyAdministrator();
  else showLogin("");
  supabaseClient.auth.onAuthStateChange(function (_event, session) {
    if (!session) showLogin("");
  });
}
start();