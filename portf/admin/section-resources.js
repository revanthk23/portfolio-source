// Universal section resource manager: drag/drop files, folders and links for every CMS section.
(function () {
  "use strict";
  const BUCKET = "cms-media";
  let currentKey = null, currentSection = null, currentFolder = null, files = [], records = [];
  const client = () => window.portfolioSupabaseClient;
  const site = () => window.portfolioCmsSiteId;
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const say = (s, bad) => { const el=document.getElementById("sectionResourcesMessage"); if(el){el.textContent=s;el.className="page-message "+(bad?"error":"success");} };
  const fileIcon = row => {
    const mime=(row.mime_type||"").toLowerCase(), name=(row.title||"").toLowerCase();
    if(mime.startsWith("image/")) return "🖼️";
    if(mime.startsWith("video/")) return "🎬";
    if(mime.startsWith("audio/")) return "🎵";
    if(mime.includes("pdf")||name.endsWith(".pdf")) return "📕";
    if(/\.(docx?|odt)$/.test(name)) return "📝";
    if(/\.(xlsx?|csv|ods)$/.test(name)) return "📊";
    if(/\.(pptx?|odp)$/.test(name)) return "📽️";
    if(/\.(zip|rar|7z|tar|gz)$/.test(name)) return "🗜️";
    return "📄";
  };
  const sizeLabel = n => n < 1024 ? n+" B" : n < 1048576 ? (n/1024).toFixed(1)+" KB" : (n/1048576).toFixed(1)+" MB";
  async function load(key) {
    currentKey=key; currentFolder=null;
    const host=document.getElementById("sectionResources");
    if(!host || !site() || !client()) return;
    host.innerHTML='<div class="loading-state">Loading section resources…</div>';
    try {
      const section=await client().from("cms_sections").select("id,page_id,title").eq("site_id",site()).eq("section_key",key).maybeSingle();
      if(section.error) throw section.error;
      if(!section.data) { host.innerHTML='<section class="section-resources-card"><h3>Section resources</h3><p class="form-hint">This section has not synced to the resource library yet. Refresh the admin dashboard and try again.</p></section>'; return; }
      currentSection=section.data;
      await refresh();
    } catch(e) { host.innerHTML='<section class="section-resources-card"><h3>Section resources</h3><p class="form-hint">Resources could not load: '+esc(e.message)+'</p></section>'; }
  }
  async function refresh() {
    const [f,r]=await Promise.all([
      client().from("cms_media").select("*").eq("site_id",site()).eq("section_id",currentSection.id).order("created_at",{ascending:false}),
      client().from("cms_content").select("*").eq("site_id",site()).eq("section_id",currentSection.id).order("created_at",{ascending:false})
    ]);
    if(f.error) throw f.error; if(r.error) throw r.error;
    files=f.data||[]; records=(r.data||[]).filter(x=>x.payload && ["folder","link"].includes(x.payload.resource_kind));
    render();
  }
  function render() {
    const host=document.getElementById("sectionResources"); if(!host)return;
    const folders=records.filter(x=>x.payload.resource_kind==="folder" && (x.payload.parent_folder_id||null)===(currentFolder||null));
    const links=records.filter(x=>x.payload.resource_kind==="link" && (x.payload.parent_folder_id||null)===(currentFolder||null));
    const media=files.filter(x=>(x.description||"folder:")==="folder:"+(currentFolder||""));
    const folderName=currentFolder ? ((records.find(x=>x.id===currentFolder)||{}).title||"Folder") : "";
    host.innerHTML='<section class="section-resources-card"><div class="resource-heading"><div><h3>Section media & resources</h3><p class="cms-help">Upload any file type here—images, videos, PDFs, Word/Excel/PowerPoint files, audio, archives and more. These files are stored separately from entry content and belong to this section.</p></div><span class="resource-count">'+files.length+' files</span></div>'+
      '<div id="sectionResourcesMessage" class="page-message" role="status"></div>'+
      '<div class="resource-dropzone" id="resourceDropzone" tabindex="0" role="button" aria-label="Choose files or drag files here"><div class="resource-drop-icon">⇧</div><strong>Drag and drop files here</strong><span>or click to browse · multiple files supported · any file type</span><input id="resourceFiles" type="file" multiple></div>'+
      '<div class="resource-toolbar"><div class="resource-create-folder"><input id="resourceFolderName" type="text" placeholder="New folder name"><button class="secondary-button" type="button" id="resourceCreateFolder">Create folder</button></div><div class="resource-create-link"><input id="resourceLinkTitle" type="text" placeholder="Link title"><input id="resourceLinkUrl" type="url" placeholder="https://…"><button class="secondary-button" type="button" id="resourceAddLink">Add link</button></div></div>'+
      '<div class="resource-breadcrumb"><button class="secondary-button" type="button" id="resourceRoot">All section resources</button>'+(currentFolder?' <span> / '+esc(folderName)+'</span>':"")+'</div>'+
      '<div id="resourceUploadStatus" class="resource-upload-status" aria-live="polite"></div>'+
      '<div class="resource-items">'+(folders.map(x=>'<div class="resource-row"><span class="resource-file-icon">📁</span><strong>'+esc(x.title)+'</strong><button class="secondary-button" data-open-folder="'+x.id+'">Open folder</button><button class="secondary-button" data-rename-resource="'+x.id+'">Rename</button><button class="danger-button" data-delete-resource="'+x.id+'">Delete</button></div>').join("")||"")+
      (links.map(x=>'<div class="resource-row"><span class="resource-file-icon">🔗</span><strong>'+esc(x.title)+'</strong><a href="'+esc(x.payload.url)+'" target="_blank" rel="noopener">Open link ↗</a><button class="secondary-button" data-rename-resource="'+x.id+'">Rename</button><button class="danger-button" data-delete-resource="'+x.id+'">Delete</button></div>').join("")||"")+
      (media.map(x=>'<div class="resource-row"><span class="resource-file-icon">'+fileIcon(x)+'</span><div class="resource-file-info"><strong>'+esc(x.title)+'</strong><span>'+esc(x.mime_type||"Unknown file type")+' · '+sizeLabel(x.file_size||0)+'</span></div><button class="secondary-button" data-resource-open="'+esc(x.id)+'">Open / download</button><button class="secondary-button" data-rename-file="'+esc(x.id)+'">Rename</button><button class="danger-button" data-delete-file="'+esc(x.id)+'">Delete</button></div>').join("")||"")+
      ((!folders.length&&!links.length&&!media.length)?'<p class="empty-state">No resources in this folder yet. Drop files above or create a folder or link.</p>':"")+'</div></section>';
  }
  async function createRecord(kind,title,payload) {
    const r=await client().from("cms_content").insert({site_id:site(),page_id:currentSection.page_id,section_id:currentSection.id,title,slug:null,payload:Object.assign({resource_kind:kind,parent_folder_id:currentFolder},payload),status:"draft",sort_order:0});
    if(r.error) throw r.error; await refresh();
  }
  async function upload(list) {
    const items=Array.from(list||[]); if(!items.length)return;
    const status=document.getElementById("resourceUploadStatus");
    for(let i=0;i<items.length;i++){
      const file=items[i];
      if(status)status.textContent='Uploading '+(i+1)+' of '+items.length+': '+file.name;
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"-");
      const path=site()+"/"+currentSection.id+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"-"+safeName;
      const up=await client().storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
      if(up.error) throw new Error("Could not upload "+file.name+": "+up.error.message);
      const mime=(file.type||"").toLowerCase();
      const type=mime.startsWith("image/")?"image":mime.startsWith("video/")?"video":mime.startsWith("audio/")?"audio":"document";
      const auth=await client().auth.getUser();
      const ins=await client().from("cms_media").insert({site_id:site(),page_id:currentSection.page_id,section_id:currentSection.id,storage_path:path,media_type:type,title:file.name,description:"folder:"+(currentFolder||""),mime_type:file.type||"application/octet-stream",file_size:file.size,status:"draft",created_by:auth.data.user.id});
      if(ins.error){await client().storage.from(BUCKET).remove([path]);throw new Error("Uploaded "+file.name+" but could not save its resource record: "+ins.error.message);}
    }
    await refresh(); say(items.length+" file(s) uploaded successfully.");
  }
  async function action(event) {
    const t=event.target.closest("button"); if(!t)return;
    try {
      if(t.id==="resourceCreateFolder"){const v=document.getElementById("resourceFolderName").value.trim();if(!v)return;await createRecord("folder",v,{});say("Folder created.");}
      if(t.id==="resourceAddLink"){const title=document.getElementById("resourceLinkTitle").value.trim(),url=document.getElementById("resourceLinkUrl").value.trim();if(!title||!/^https?:\/\//i.test(url)){say("Enter a title and a valid http/https link.",true);return;}await createRecord("link",title,{url});say("Link saved.");}
      if(t.id==="resourceRoot"){currentFolder=null;render();}
      if(t.dataset.openFolder){currentFolder=t.dataset.openFolder;render();}
      if(t.dataset.renameResource){const row=records.find(x=>x.id===t.dataset.renameResource);const title=prompt("New name",row.title);if(title&&title.trim()){const r=await client().from("cms_content").update({title:title.trim()}).eq("id",row.id);if(r.error)throw r.error;await refresh();}}
      if(t.dataset.deleteResource){const row=records.find(x=>x.id===t.dataset.deleteResource);if(confirm("Delete "+row.title+"?")){const r=await client().from("cms_content").delete().eq("id",row.id);if(r.error)throw r.error;await refresh();}}
      if(t.dataset.renameFile){const row=files.find(x=>x.id===t.dataset.renameFile);const title=prompt("New file name",row.title);if(title&&title.trim()){const r=await client().from("cms_media").update({title:title.trim()}).eq("id",row.id);if(r.error)throw r.error;await refresh();}}
      if(t.dataset.deleteFile){const row=files.find(x=>x.id===t.dataset.deleteFile);if(confirm("Delete "+row.title+"?")){const rm=await client().storage.from(BUCKET).remove([row.storage_path]);if(rm.error)throw rm.error;const d=await client().from("cms_media").delete().eq("id",row.id);if(d.error)throw d.error;await refresh();}}
      if(t.dataset.resourceOpen){const row=files.find(x=>x.id===t.dataset.resourceOpen);const u=await client().storage.from(BUCKET).createSignedUrl(row.storage_path,3600,{download:row.title});if(u.error)throw u.error;window.open(u.data.signedUrl,"_blank","noopener");}
    }catch(e){say(e.message||"Action failed.",true);}
  }
  document.addEventListener("click",e=>{if(e.target.closest("#sectionResources"))action(e);});
  document.addEventListener("change",e=>{if(e.target.id==="resourceFiles"&&e.target.files?.length){upload(e.target.files).catch(err=>say(err.message,true));e.target.value="";}});
  document.addEventListener("dragover",e=>{if(e.target.closest("#resourceDropzone")){e.preventDefault();document.getElementById("resourceDropzone").classList.add("drag-over");}});
  document.addEventListener("dragleave",e=>{if(e.target.closest("#resourceDropzone")&&!e.relatedTarget?.closest?.("#resourceDropzone"))document.getElementById("resourceDropzone")?.classList.remove("drag-over");});
  document.addEventListener("drop",e=>{if(e.target.closest("#resourceDropzone")){e.preventDefault();document.getElementById("resourceDropzone")?.classList.remove("drag-over");upload(e.dataTransfer.files).catch(err=>say(err.message,true));}});
  document.addEventListener("click",e=>{if(e.target.closest("#resourceDropzone")&&e.target.id!=="resourceFiles")document.getElementById("resourceFiles")?.click();});
  window.sectionResources={load};
})();