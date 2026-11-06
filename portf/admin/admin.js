// Portfolio Admin CMS
// Uses only the Supabase public publishable/anon key. Never add a service-role key here.
const SUPABASE_URL = "https://lfmbvvwnrhohdifypuyw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kwoxePVR6yzu60XODZJhxg_Kngnh01x";
const MEDIA_BUCKET = "portfolio-media";

const SECTION_TITLES = {
  about: "About Me", experience: "Experience", projects: "Projects",
  skills: "Skills", services: "Services", food: "Food Business",
  farm: "Farm Business", courses: "Courses", contact: "Contact Details",
  settings: "Website Settings"
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
    '<label>Content (JSON)<textarea id="recordContent" rows="9" spellcheck="false">{
  "description": ""
}</textarea><small>Use valid JSON. You can add fields such as description, image, date, role, or links.</small></label>' +
    '<div class="form-row"><label>Status<select id="recordStatus"><option value="draft">Draft</option><option value="published">Published</option></select></label>' +
    '<label>Sort order<input id="recordSort" type="number" value="0"></label></div>' +
    '<div class="form-actions"><button class="primary-button" type="submit">Save entry</button><button class="secondary-button" type="button" id="cancelEditButton">Clear</button></div>' +
    '<p class="form-hint">Saving a record does not automatically update the public website. Public-site integration is a separate step.</p></form></div>';
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
  if (json) json.value = '{
  "description": ""
}';
}
function editRecord(id) {
  const record = currentRecords.find(function (item) { return item.id === id; });
  if (!record) return;
  editingId = id;
  document.getElementById("editorTitle").textContent = "Edit entry";
  document.getElementById("recordTitle").value = record.title || "";
  document.getElementById("recordSlug").value = record.slug || "";
  document.getElementById("recordContent").value = JSON.stringify(record.content || {}, null, 2);
  document.getElementById("recordStatus").value = record.status || "draft";
  document.getElementById("recordSort").value = record.sort_order || 0;
  document.getElementById("recordTitle").focus();
}
async function saveRecord(event) {
  event.preventDefault();
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
    status: document.getElementById("recordStatus").value,
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
        '</strong><button class="danger-button" data-delete-media="' + escapeHtml(name) + '">Delete</button></div></article>';
    }).join("") : '<p class="empty-state">No ' + (isVideo ? "videos" : "images") + ' uploaded yet.</p>') + '</div>';
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
  const mediaDel = event.target.closest("[data-delete-media]");
  if (mediaDel) return deleteMedia(mediaDel.dataset.deleteMedia);
  if (event.target.id === "newRecordButton") return clearEditor();
  if (event.target.id === "cancelEditButton") return clearEditor();
  if (event.target.id === "retryOverview") return renderOverview();
  if (event.target.id === "retrySection") return renderSection(currentSection);
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