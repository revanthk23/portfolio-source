/* Visual editor for the existing portfolio page.
 * Uses the existing Supabase publishable key and is_portfolio_admin RPC.
 * Existing HTML remains the design source; edits are stored as CMS content records.
 */
(function () {
  "use strict";
  var URL = "https://lfmbvvwnrhohdifypuyw.supabase.co";
  var KEY = "sb_publishable_kwoxePVR6yzu60XODZJhxg_Kngnh01x";
  var params = new URLSearchParams(location.search);
  var editMode = params.get("mode") === "edit";
  var client = null, siteId = null, pageId = null, sections = new Map();
  var selected = null, selectedSection = null, selectedRecord = null;
  var overlay = null, panel = null, message = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]);}); }
  function rootFor(el) { return el && el.closest("section[id], .topic[id]"); }
  function elementPath(el, root) {
    var parts = [], node = el;
    while (node && node !== root) {
      var tag = node.tagName.toLowerCase(), n = 1, sib = node;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === node.tagName) n++;
      parts.unshift(tag + ":nth-of-type(" + n + ")");
      node = node.parentElement;
    }
    return parts.join(">");
  }
  function ensureKey(el, root) {
    var key = root.id + "__" + elementPath(el, root).replace(/[^a-zA-Z0-9_-]/g, "_");
    el.setAttribute("data-ve-key", key);
    return key;
  }
  function valueOf(el) {
    if (el.tagName === "IMG") return el.getAttribute("src") || "";
    if (el.tagName === "A") return el.getAttribute("href") || "";
    if (el.tagName === "VIDEO" || el.tagName === "SOURCE") return el.getAttribute("src") || "";
    return el.innerHTML;
  }
  function applyValue(el, kind, value) {
    if (!el) return;
    if (kind === "image" || kind === "link" || kind === "video") {
      var attr = kind === "image" || kind === "video" ? "src" : "href";
      el.setAttribute(attr, value);
      if (kind === "image") el.alt = el.alt || "Portfolio image";
    } else {
      el.innerHTML = value;
    }
  }
  function showMessage(text) { if (message) message.textContent = text; }
  function addStyles() {
    if (document.getElementById("visualEditorStyles")) return;
    var style = document.createElement("style");
    style.id = "visualEditorStyles";
    style.textContent = [
      "#veAdminLink{border:1px solid rgba(245,196,81,.65);border-radius:999px;padding:8px 14px;color:#f5c451!important}",
      "body.ve-editing [data-ve-key]{cursor:pointer;outline:1px dashed rgba(245,196,81,.55);outline-offset:3px}",
      "body.ve-editing [data-ve-key]:hover,body.ve-editing [data-ve-key].ve-selected{outline:2px solid #f5c451;outline-offset:4px}",
      "#vePanel{position:fixed;right:18px;bottom:18px;width:min(390px,calc(100vw - 36px));max-height:82vh;overflow:auto;z-index:10001;background:#100a22;color:#f4f0ff;border:1px solid #f5c451;border-radius:18px;padding:18px;box-shadow:0 18px 60px #000b;font:14px system-ui,sans-serif}",
      "#vePanel h2{font-size:18px;color:#f5c451;margin:0 0 10px}#vePanel label{display:block;margin:10px 0 5px;font-weight:700}",
      "#vePanel input,#vePanel textarea{box-sizing:border-box;width:100%;padding:10px;border-radius:8px;border:1px solid #75668f;background:#211638;color:#fff;font:14px system-ui}",
      "#vePanel textarea{min-height:100px;resize:vertical}#vePanel button{padding:10px 13px;border:0;border-radius:8px;margin:8px 6px 0 0;background:#f5c451;color:#100a22;font-weight:800;cursor:pointer}",
      "#vePanel button.secondary{background:#34244f;color:#fff;border:1px solid #79649b}#vePanel .ve-muted{color:#c9bddc;font-size:12px}#vePanel #veMessage{min-height:18px;color:#f5c451}",
      "#veLogin{position:fixed;inset:0;z-index:10002;background:#0b0718ee;display:grid;place-items:center;padding:20px;font:14px system-ui}",
      "#veLogin form{width:min(390px,100%);background:#160d2a;border:1px solid #f5c451;border-radius:18px;padding:24px;color:#fff;box-sizing:border-box}",
      "#veLogin h2{color:#f5c451;margin:0 0 8px}#veLogin label{display:block;margin:14px 0 5px}#veLogin input{box-sizing:border-box;width:100%;padding:12px;border-radius:8px;border:1px solid #79649b;background:#211638;color:#fff}"
    ].join("");
    document.head.appendChild(style);
  }
  function addAdminLink() {
    var nav = document.querySelector("header .nav");
    if (!nav || document.getElementById("veAdminLink")) return;
    var a = document.createElement("a");
    a.id = "veAdminLink"; a.href = "?mode=edit"; a.textContent = "Admin";
    nav.appendChild(a);
  }
  function loginView() {
    addStyles();
    var box = document.createElement("div");
    box.id = "veLogin";
    box.innerHTML = '<form id="veLoginForm"><h2>Portfolio Admin</h2><p>Sign in to edit this website.</p><label for="veEmail">Email</label><input id="veEmail" type="email" autocomplete="username" required><label for="vePassword">Password</label><input id="vePassword" type="password" autocomplete="current-password" required><button type="submit">Sign in and open editor</button><p id="veLoginMessage" role="status"></p><button type="button" id="veCancel" class="secondary">Return to website</button></form>';
    document.body.appendChild(box);
    box.querySelector("#veCancel").onclick = function(){ location.href = location.pathname; };
    box.querySelector("form").onsubmit = async function(e){
      e.preventDefault();
      var out = box.querySelector("#veLoginMessage"); out.textContent = "Checking administrator access…";
      var res = await client.auth.signInWithPassword({email:box.querySelector("#veEmail").value.trim(),password:box.querySelector("#vePassword").value});
      if (res.error) { out.textContent = "Sign-in failed. Check your credentials."; return; }
      await authorize(box, out);
    };
  }
  async function authorize(loginBox, out) {
    var user = await client.auth.getUser();
    if (!user.data || !user.data.user) { out.textContent = "Please sign in again."; return; }
    var check = await client.rpc("is_portfolio_admin");
    if (check.error || check.data !== true) {
      await client.auth.signOut(); out.textContent = "This account is not authorized to edit this website."; return;
    }
    var boot = await client.rpc("cms_bootstrap_portfolio_site");
    if (boot.error || !boot.data) { out.textContent = "CMS setup could not be verified: " + (boot.error ? boot.error.message : "No site returned"); return; }
    siteId = boot.data;
    var page = await client.from("cms_pages").select("id").eq("site_id",siteId).eq("slug","home").maybeSingle();
    if (page.error || !page.data) { out.textContent = "The portfolio page is not synced yet. Open the existing admin workspace once, then refresh."; return; }
    pageId = page.data.id;
    var rows = await client.from("cms_sections").select("id,section_key,title").eq("site_id",siteId).eq("page_id",pageId);
    if (rows.error) { out.textContent = "Could not load website structure: " + rows.error.message; return; }
    sections.clear(); (rows.data || []).forEach(function(row){sections.set(row.section_key,row);});
    loginBox.remove();
    startEditor();
  }
  function panelMarkup() {
    var p = document.createElement("aside");
    p.id = "vePanel";
    p.innerHTML = '<h2>Visual website editor</h2><div class="ve-muted" id="veSelectedName">Select text, an image, a link or a video on the page.</div><label for="veValue">Content / URL</label><textarea id="veValue" disabled></textarea><div class="ve-muted">Changes are previewed on this page. Save as draft first; publish only when ready.</div><div><button id="veSave">Save draft</button><button id="vePublish">Publish</button><button id="veReset" class="secondary">Reset selection</button><button id="veExit" class="secondary">Exit editor</button></div><p id="veMessage" role="status"></p>';
    document.body.appendChild(p);
    panel = p; message = p.querySelector("#veMessage");
    p.querySelector("#veValue").addEventListener("input",function(){ if(selected) applyValue(selected,selectedKind(),this.value); });
    p.querySelector("#veSave").onclick=function(){save("draft");};
    p.querySelector("#vePublish").onclick=function(){save("published");};
    p.querySelector("#veReset").onclick=function(){if(selected)selected.classList.remove("ve-selected");selected=null;selectedSection=null;selectedRecord=null;p.querySelector("#veValue").value="";p.querySelector("#veValue").disabled=true;p.querySelector("#veSelectedName").textContent="Select an element on the page.";};
    p.querySelector("#veExit").onclick=async function(){await client.auth.signOut();location.href=location.pathname;};
  }
  function selectedKind() {
    if (!selected) return "text";
    if (selected.tagName === "IMG") return "image";
    if (selected.tagName === "A") return "link";
    if (selected.tagName === "VIDEO" || selected.tagName === "SOURCE") return "video";
    return "text";
  }
  async function selectElement(el) {
    var root = rootFor(el);
    if (!root || !sections.has(root.id)) { showMessage("This element is outside a synced website section."); return; }
    if (selected) selected.classList.remove("ve-selected");
    selected = el; selectedSection = sections.get(root.id); selected.classList.add("ve-selected");
    var key = ensureKey(el,root), kind = selectedKind();
    panel.querySelector("#veSelectedName").textContent = selectedSection.title + " · " + kind;
    panel.querySelector("#veValue").disabled = false;
    panel.querySelector("#veValue").value = valueOf(el);
    showMessage("Selected. Edit the field above, then save.");
    var found = await client.from("cms_content").select("id,status,payload")
      .eq("site_id",siteId).eq("section_id",selectedSection.id).eq("slug","visual:"+key)
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    selectedRecord = found.data || null;
    if (found.error) showMessage("Could not check saved version: "+found.error.message);
    if (selectedRecord && selectedRecord.status === "published") panel.querySelector("#veSelectedName").textContent += " · published version loaded";
  }
  async function save(status) {
    if (!selected || !selectedSection) { showMessage("Select a website element first."); return; }
    var key = ensureKey(selected,rootFor(selected)), kind = selectedKind(), value = panel.querySelector("#veValue").value;
    var payload = {visual_editor:true,element_key:key,element_kind:kind,element_value:value};
    var data = {site_id:siteId,page_id:pageId,section_id:selectedSection.id,title:"Visual edit: "+key,slug:"visual:"+key,payload:payload,status:status,sort_order:0,published_at:status==="published"?new Date().toISOString():null};
    var result;
    if (selectedRecord && selectedRecord.id) {
      result = await client.from("cms_content").update(data).eq("id",selectedRecord.id).select("id,status,payload").single();
    } else {
      result = await client.from("cms_content").insert(data).select("id,status,payload").single();
    }
    if (result.error) { showMessage("Save failed: "+result.error.message); return; }
    selectedRecord = result.data;
    applyValue(selected,kind,value);
    showMessage(status==="published"?"Published. The public page will load this edit.":"Draft saved. It is visible only in this editor preview.");
  }
  function startEditor() {
    addStyles(); document.body.classList.add("ve-editing"); panelMarkup();
    document.addEventListener("click",function(e){
      if (e.target.closest("#vePanel") || e.target.closest("#veLogin")) return;
      var el=e.target.closest("h1,h2,h3,p,a,button,img,video,source,li,span");
      if (!el || !rootFor(el)) return;
      e.preventDefault(); e.stopPropagation(); selectElement(el);
    },true);
    showMessage("Admin access verified. Select an element to edit.");
  }
  async function loadPublished() {
    var pub = window.supabase.createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    var result = await pub.from("cms_content").select("payload")
      .eq("status","published");
    if (result.error) return;
    (result.data || []).forEach(function(row){
      var p=row.payload||{};
      if (!p.visual_editor || !p.element_key) return;
      var el=document.querySelector('[data-ve-key="'+CSS.escape(p.element_key)+'"]');
      if (!el) {
        var rootId=String(p.element_key).split("__")[0];
        var root=document.getElementById(rootId);
        if (!root) return;
        var nodes=root.querySelectorAll("h1,h2,h3,p,a,button,img,video,source,li,span");
        nodes.forEach(function(node){if(ensureKey(node,root)===p.element_key)el=node;});
      }
      if (el) applyValue(el,p.element_kind,p.element_value);
    });
  }
  function boot() {
    addAdminLink();
    if (!window.supabase || !window.supabase.createClient) return;
    if (editMode) {
      addStyles();
      client=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      loginView();
      client.auth.getSession().then(function(r){if(r.data&&r.data.session){var fake=document.querySelector("#veLoginMessage");authorize(document.getElementById("veLogin"),fake||{set textContent(v){}});}});
    } else loadPublished();
  }
  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
})();