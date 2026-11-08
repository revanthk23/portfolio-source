// CMS section manager: creates and maintains the saved website hierarchy.
(function () {
  "use strict";
  const nav = document.getElementById("sectionNav");
  const panel = document.getElementById("contentPanel");
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  let rows = [];
  let pageId = null;
  let editing = null;

  function client() { return window.portfolioSupabaseClient; }
  function siteId() { return window.portfolioCmsSiteId; }
  function slugify(value) {
    return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function ensureNavButton() {
    if (!nav || nav.querySelector('[data-section="section-manager"]')) return;
    const button = document.createElement("button");
    button.className = "nav-item";
    button.dataset.section = "section-manager";
    button.textContent = "Section Manager";
    const first = nav.querySelector('[data-section="overview"]');
    if (first && first.nextSibling) nav.insertBefore(button, first.nextSibling);
    else nav.prepend(button);
  }
  if (nav) {
    new MutationObserver(ensureNavButton).observe(nav, { childList: true, subtree: true });
    ensureNavButton();
    nav.addEventListener("click", event => {
      const button = event.target.closest('[data-section="section-manager"]');
      if (!button) return;
      event.preventDefault();
      render().catch(showError);
    });
  }

  async function loadRows() {
    const db = client();
    if (!db || !siteId()) throw new Error("The CMS connection is not ready. Sign in again and retry.");
    const page = await db.from("cms_pages").select("id").eq("site_id", siteId()).eq("slug", "home").maybeSingle();
    if (page.error) throw page.error;
    if (!page.data) throw new Error("The portfolio Home page has not been initialized yet.");
    pageId = page.data.id;
    const result = await db.from("cms_sections")
      .select("id,section_key,title,section_type,parent_section_id,status,sort_order")
      .eq("site_id", siteId()).eq("page_id", pageId).order("sort_order", { ascending: true });
    if (result.error) throw result.error;
    rows = result.data || [];
  }
  function render() {
    return loadRows().then(() => {
      const parents = rows.filter(row => !row.parent_section_id);
      panel.innerHTML =
        '<div class="section-heading"><div><h2>Section Manager</h2><p>Create and organize main website sections and nested subsections. Changes are saved to the CMS hierarchy.</p></div><button class="primary-button" id="newCmsSection">+ New section</button></div>' +
        '<div id="sectionManagerMessage" class="page-message" role="status"></div>' +
        '<div class="record-list">' +
        (rows.length ? rows.map(row => {
          const parent = rows.find(p => p.id === row.parent_section_id);
          return '<article class="record-card"><div class="record-card-top"><strong>' +
            (parent ? '↳ ' : '') + esc(row.title) + '</strong><span class="status-pill ' + esc(row.status) + '">' +
            esc(row.status) + '</span></div><p><code>' + esc(row.section_key) + '</code>' +
            (parent ? ' · Under ' + esc(parent.title) : ' · Main section') + ' · Order ' + Number(row.sort_order || 0) +
            '</p><div class="record-actions"><button class="secondary-button" data-edit-section="' + esc(row.id) + '">Edit</button>' +
            '<button class="danger-button" data-remove-section="' + esc(row.id) + '">Delete</button></div></article>';
        }).join("") : '<p class="empty-state">No sections have been registered yet.</p>') +
        '</div><form id="cmsSectionForm" class="editor-form" hidden><h3 id="cmsSectionFormTitle">New section</h3>' +
        '<label>Section title<input id="cmsSectionTitle" maxlength="120" required placeholder="e.g. Projects"></label>' +
        '<label>Section key<input id="cmsSectionKey" maxlength="70" required placeholder="e.g. projects"><small>Use lowercase letters, numbers and hyphens. Existing keys cannot be changed after creation.</small></label>' +
        '<label>Section type<select id="cmsSectionType"><option value="main">Main section</option><option value="subsection">Subsection</option></select></label>' +
        '<label>Parent section<select id="cmsSectionParent"><option value="">None — main section</option>' +
        parents.map(p => '<option value="' + esc(p.id) + '">' + esc(p.title) + '</option>').join("") + '</select></label>' +
        '<div class="form-row"><label>Status<select id="cmsSectionStatus"><option value="draft">Draft</option><option value="published">Published</option><option value="hidden">Hidden</option></select></label>' +
        '<label>Display order<input id="cmsSectionOrder" type="number" value="0"></label></div>' +
        '<div class="form-actions"><button class="primary-button" type="submit">Save section</button><button class="secondary-button" id="cancelCmsSection" type="button">Cancel</button></div></form>' +
        '<div class="notice"><strong>How publishing works</strong><p>Draft and hidden sections stay off the public site. Published sections are eligible to appear publicly once the public renderer is connected. Existing website sections remain discoverable automatically.</p></div>';
      document.getElementById("pageTitle").textContent = "Section Manager";
      document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.section === "section-manager"));
    });
  }
  function message(text, isError) {
    const el = document.getElementById("sectionManagerMessage");
    if (el) { el.textContent = text; el.className = "page-message " + (isError ? "error" : "success"); }
  }
  function showError(error) {
    panel.innerHTML = '<div class="notice error"><strong>Section Manager could not load</strong><p>' +
      esc(error && error.message || "Unknown error") + '</p><button class="secondary-button" id="retryCmsSections">Try again</button></div>';
    document.getElementById("pageTitle").textContent = "Section Manager";
  }
  function openForm(row) {
    editing = row ? row.id : null;
    const form = document.getElementById("cmsSectionForm");
    form.hidden = false;
    document.getElementById("cmsSectionFormTitle").textContent = row ? "Edit section" : "Create section";
    document.getElementById("cmsSectionTitle").value = row ? row.title : "";
    document.getElementById("cmsSectionKey").value = row ? row.section_key : "";
    document.getElementById("cmsSectionKey").disabled = !!row;
    document.getElementById("cmsSectionType").value = row && row.parent_section_id ? "subsection" : "main";
    document.getElementById("cmsSectionParent").value = row ? row.parent_section_id || "" : "";
    document.getElementById("cmsSectionStatus").value = row ? row.status : "draft";
    document.getElementById("cmsSectionOrder").value = row ? row.sort_order : rows.length;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  panel.addEventListener("click", async event => {
    if (event.target.id === "newCmsSection") return openForm(null);
    if (event.target.id === "cancelCmsSection") { editing = null; document.getElementById("cmsSectionForm").hidden = true; return; }
    if (event.target.id === "retryCmsSections") return render().catch(showError);
    const edit = event.target.closest("[data-edit-section]");
    if (edit) return openForm(rows.find(row => row.id === edit.dataset.editSection));
    const remove = event.target.closest("[data-remove-section]");
    if (remove) {
      const row = rows.find(item => item.id === remove.dataset.removeSection);
      if (!row || !window.confirm('Delete section "' + row.title + '"? Sections with content or child sections may be protected by database relationships.')) return;
      const result = await client().from("cms_sections").delete().eq("id", row.id);
      if (result.error) return message("Delete failed: " + result.error.message, true);
      await render();
      message("Section deleted.", false);
    }
  });
  panel.addEventListener("change", event => {
    if (event.target.id === "cmsSectionType") {
      const parent = document.getElementById("cmsSectionParent");
      if (event.target.value === "main") parent.value = "";
    }
  });
  panel.addEventListener("submit", async event => {
    if (event.target.id !== "cmsSectionForm") return;
    event.preventDefault();
    const title = document.getElementById("cmsSectionTitle").value.trim();
    const type = document.getElementById("cmsSectionType").value;
    const parentId = type === "subsection" ? document.getElementById("cmsSectionParent").value || null : null;
    const status = document.getElementById("cmsSectionStatus").value;
    const sort = Number.parseInt(document.getElementById("cmsSectionOrder").value, 10);
    const key = editing ? null : slugify(document.getElementById("cmsSectionKey").value);
    if (!title) return message("Enter a section title.", true);
    if (!editing && (!key || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key))) return message("Enter a valid section key.", true);
    if (type === "subsection" && !parentId) return message("Choose a parent for this subsection.", true);
    const duplicate = rows.find(row => row.section_key === key && row.id !== editing);
    if (duplicate) return message("That section key is already in use.", true);
    const values = { title, parent_section_id: parentId, status, sort_order: Number.isFinite(sort) ? sort : 0,
      section_type: type };
    let result;
    if (editing) result = await client().from("cms_sections").update(values).eq("id", editing);
    else result = await client().from("cms_sections").insert({
      site_id: siteId(), page_id: pageId, section_key: key, layout_key: "default",
      field_schema: { type: "object", fields: [] }, settings: {}, ...values
    });
    if (result.error) return message("Save failed: " + result.error.message, true);
    editing = null;
    await loadRows();
    if (typeof window.portfolioRefreshCmsNavigation === "function") await window.portfolioRefreshCmsNavigation();
    await render();
    message("Section saved. The CMS hierarchy and admin navigation are updated.", false);
  });
  window.portfolioSectionManager = { render };
})();
