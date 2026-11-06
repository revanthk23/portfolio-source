// Reusable section resources: private files, links and folders for every CMS section.
(function () {
  "use strict";
  const BUCKET = "cms-media";
  let currentKey = null, currentSection = null, currentFolder = null;
  let files = [], records = [];
  const client = () => window.portfolioSupabaseClient;
  const site = () => window.portfolioCmsSiteId;
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const say = (s, bad) => { const el=document.getElementById("sectionResourcesMessage"); if(el){el.textContent=s;el.className="page-message "+(bad?"error":"success");} };
  async function load(key) {
    currentKey=key;
    const host=document.getElementById("sectionResources");
    if(!host || !site() || !client()) return;
    host.innerHTML='<div class="loading-state">Loading section resources…</div>';
    try {
      const section=await client().from("cms_sections").select("id,page_id,title").eq("site_id",site()).eq("section_key",key).maybeSingle();
      if(section.error) throw section.error;
      if(!section.data) { host.innerHTML='<p class="form-hint">Resources will be available after this section is synced.</p>'; return; }
      currentSection=section.data;
      await refresh();
    } catch(e) { host.innerHTML='<p class="form-hint">Resources could not load: '+esc(e.message)+'</p>'; }
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
    const media=files.filter(x=>(x.description||"").indexOf("folder:")===0 ? x.description==="folder:"+currentFolder : !x.description || x.description==="folder:"+(currentFolder||""));
    host.innerHTML='<section class="cms-editor-card section-resources-card"><h3>Section resources</h3><p class="cms-help">Add any file type, useful links, and folders independently of content entries. Resources are private drafts until public display is connected.</p><div id="sectionResourcesMessage" class="page-message" role="status"></div>'+
      '<div class="form-row"><label>Upload files<input id="resourceFiles" type="file" multiple></label><label>Folder name<input id="resourceFolderName" placeholder="New folder"></label><button class="secondary-button" type="button" id="resourceCreateFolder">Create folder</button></div>'+
      '<div class="form-row"><label>Link title<input id="resourceLinkTitle" placeholder="Project or reference name"></label><label>URL<input id="resourceLinkUrl" type="url" placeholder="https://…"></label><button class="secondary-button" type="button" id="resourceAddLink">Add link</button></div>'+
      '<div class="resource-breadcrumb"><button class="secondary-button" type="button" id="resourceRoot">All resources</button> '+(currentFolder?' / '+esc((records.find(x=>x.id===currentFolder)||{}).title||"Folder"):"")+'</div>'+
      '<div class="resource-items">'+(folders.map(x=>'<div class="resource-row"><strong>📁 '+esc(x.title)+'</strong><button class="secondary-button" data-open-folder="'+x.id+'">Open</button><button class="secondary-button" data-rename-resource="'+x.id+'">Rename</button><button class="danger-button" data-delete-resource="'+x.id+'">Delete</button></div>').join("")||"")+
      (links.map(x=>'<div class="resource-row"><strong>🔗 '+esc(x.title)+'</strong><a href="'+esc(x.payload.url)+'" target="_blank" rel="noopener">Open link ↗</a><button class="secondary-button" data-rename-resource="'+x.id+'">Edit</button><button class="danger-button" data-delete-resource="'+x.id+'">Delete</button></div>').join("")||"")+
      (media.map(x=>'<div class="resource-row"><strong>📄 '+esc(x.title)+'</strong><span>'+esc(x.mime_type||x.media_type)+' · '+Math.ceil((x.file_size||0)/1024)+' KB</span><button class="secondary-button" data-resource-download="'+esc(x.id)+'">Open</button><button class="danger-button" data-delete-file="'+esc(x.id)+'">Delete</button></div>').join("")||"")+
      '</div></section>';
  }
  async function createRecord(kind,title,payload) {
    const r=await client().from("cms_content").insert({site_id:site(),page_id:currentSection.page_id,section_id:currentSection.id,title,slug:null,payload:Object.assign({resource_kind:kind,parent_folder_id:currentFolder},payload),status:"draft",sort_order:0});
    if(r.error) throw r.error;
    await refresh();
  }
  async function upload(list) {
    for(const file of Array.from(list||[])) {
      const name=file.name.replace(/[^a-zA-Z0-9._-]/g,"-");
      const path=site()+"/"+currentSection.id+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"-"+name;
      const up=await client().storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type||undefined});
      if(up.error) throw up.error;
      const type=file.type.startsWith("image/")?"image":file.type.startsWith("video/")?"video":file.type.startsWith("audio/")?"audio":"document";
      const ins=await client().from("cms_media").insert({site_id:site(),page_id:currentSection.page_id,section_id:currentSection.id,storage_path:path,media_type:type,title:file.name,description:"folder:"+(currentFolder||""),mime_type:file.type||null,file_size:file.size,status:"draft",created_by:(await client().auth.getUser()).data.user.id});
      if(ins.error){await client().storage.from(BUCKET).remove([path]);throw ins.error;}
    }
    await refresh(); say("Files uploaded.");
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
      if(t.dataset.deleteFile){const row=files.find(x=>x.id===t.dataset.deleteFile);if(confirm("Delete "+row.title+"?")){const rm=await client().storage.from(BUCKET).remove([row.storage_path]);if(rm.error)throw rm.error;const d=await client().from("cms_media").delete().eq("id",row.id);if(d.error)throw d.error;await refresh();}}
      if(t.dataset.resourceDownload){const row=files.find(x=>x.id===t.dataset.resourceDownload);const u=await client().storage.from(BUCKET).createSignedUrl(row.storage_path,3600);if(u.error)throw u.error;window.open(u.data.signedUrl,"_blank","noopener");}
    }catch(e){say(e.message||"Action failed.",true);}
  }
  document.addEventListener("click",e=>{if(e.target.closest("#sectionResources"))action(e);});
  document.addEventListener("change",e=>{if(e.target.id==="resourceFiles"&&e.target.files?.length){upload(e.target.files).catch(err=>say(err.message,true));e.target.value="";}});
  window.sectionResources={load};
})();