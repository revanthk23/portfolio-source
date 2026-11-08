/* Selection-based visual editor for the real portfolio page. */
(function () {
  "use strict";
  var SUPABASE_URL="https://lfmbvvwnrhohdifypuyw.supabase.co";
  var SUPABASE_KEY="sb_publishable_kwoxePVR6yzu60XODZJhxg_Kngnh01x";
  var BUCKET="cms-media", editMode=new URLSearchParams(location.search).get("mode")==="edit";
  var client=null,siteId=null,pageId=null,sections=new Map(),selected=null,selectedSection=null;
  var selectedRecord=null,selectedMedia=null,toolbar=null,editor=null,statusNode=null,editing=false;
  function rootFor(el){return el&&el.closest("section[id],.topic[id]");}
  function pathFor(el,root){var p=[],n=el;while(n&&n!==root){var t=n.tagName.toLowerCase(),i=1,s=n;while((s=s.previousElementSibling))if(s.tagName===n.tagName)i++;p.unshift(t+":nth-of-type("+i+")");n=n.parentElement;}return p.join(">");}
  function keyFor(el,root){var k=root.id+"__"+pathFor(el,root).replace(/[^a-zA-Z0-9_-]/g,"_");el.setAttribute("data-ve-key",k);return k;}
  function kindOf(el){if(el.tagName==="IMG")return"image";if(el.tagName==="VIDEO"||el.tagName==="SOURCE")return"video";if(el.tagName==="A")return"link";return"text";}
  function valueOf(el){var k=kindOf(el);return k==="image"||k==="video"?el.getAttribute("src")||"":k==="link"?el.getAttribute("href")||"":el.textContent;}
  function apply(el,k,v){if(!el)return;if(k==="image"||k==="video")el.setAttribute("src",v);else if(k==="link")el.setAttribute("href",v);else el.textContent=v;}
  function say(s){if(statusNode)statusNode.textContent=s;}
  function styles(){
    if(document.getElementById("veStyles"))return;
    var s=document.createElement("style");s.id="veStyles";s.textContent=[
      "#veAdminLink{border:1px solid #e8b94f;border-radius:99px;padding:8px 14px;color:#e8b94f!important}",
      "body.ve-editing [data-ve-key]{cursor:pointer;outline:1px dashed #e8b94f88;outline-offset:3px}",
      "body.ve-editing [data-ve-key]:hover,body.ve-editing [data-ve-key].ve-selected{outline:2px solid #e8b94f;outline-offset:4px}",
      "#veToolbar{position:fixed;z-index:10020;display:none;min-width:280px;max-width:min(430px,calc(100vw - 24px));background:#171027;color:#fff;border:1px solid #e8b94f;border-radius:14px;padding:10px;box-shadow:0 14px 45px #0009;font:13px system-ui;}",
      "#veToolbar .ve-head{font-weight:800;color:#f2ca68;padding:4px 6px 8px;max-width:390px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      "#veToolbar .ve-actions{display:flex;gap:6px;flex-wrap:wrap}#veToolbar button{border:0;border-radius:8px;padding:8px 10px;background:#e8b94f;color:#171027;font-weight:750;cursor:pointer}",
      "#veToolbar button.alt{background:#34284b;color:#fff;border:1px solid #66547e}#veToolbar button:disabled{opacity:.45;cursor:not-allowed}",
      "#veToolbar .ve-editbox{display:none;padding:7px 3px}#veToolbar textarea,#veToolbar input[type=url]{box-sizing:border-box;width:100%;padding:9px;border-radius:8px;border:1px solid #6f6088;background:#261b39;color:#fff;font:13px system-ui}",
      "#veToolbar textarea{min-height:80px;resize:vertical}#veToolbar .ve-status{font-size:12px;color:#e8d9b8;min-height:18px;padding:6px 4px 0}",
      "#veLogin{position:fixed;inset:0;z-index:10030;background:#090614ed;display:grid;place-items:center;padding:20px;font:14px system-ui}",
      "#veLogin form{width:min(390px,100%);background:#171027;border:1px solid #e8b94f;border-radius:18px;padding:24px;color:#fff;box-sizing:border-box}",
      "#veLogin h2{color:#e8b94f;margin:0 0 8px}#veLogin label{display:block;margin:14px 0 5px}#veLogin input{box-sizing:border-box;width:100%;padding:12px;border-radius:8px;border:1px solid #79649b;background:#261b39;color:#fff}",
      "#veLogin button{margin-top:12px;padding:10px 14px;border:0;border-radius:8px;background:#e8b94f;color:#171027;font-weight:800}"
    ].join("");document.head.appendChild(s);
  }
  function adminLink(){var nav=document.querySelector("header .nav");if(!nav||document.getElementById("veAdminLink"))return;var a=document.createElement("a");a.id="veAdminLink";a.href="?mode=edit";a.textContent="Admin";nav.appendChild(a);}
  function login(){
    var box=document.createElement("div");box.id="veLogin";box.innerHTML='<form><h2>Portfolio Admin</h2><p>Sign in to edit this website.</p><label>Email</label><input id="veEmail" type="email" required autocomplete="username"><label>Password</label><input id="vePassword" type="password" required autocomplete="current-password"><button type="submit">Sign in</button><button type="button" id="veBack" style="margin-left:8px;background:#423451;color:white">Back to website</button><p id="veLoginMsg"></p></form>';document.body.appendChild(box);
    box.querySelector("#veBack").onclick=function(){location.href=location.pathname;};
    box.querySelector("form").onsubmit=async function(e){e.preventDefault();var msg=box.querySelector("#veLoginMsg");msg.textContent="Verifying administrator…";var r=await client.auth.signInWithPassword({email:box.querySelector("#veEmail").value.trim(),password:box.querySelector("#vePassword").value});if(r.error){msg.textContent="Sign-in failed. Check your credentials.";return;}await authorize(box,msg);};
  }
  async function authorize(box,msg){
    var u=await client.auth.getUser();if(!u.data||!u.data.user){msg.textContent="Please sign in.";return;}
    var auth=await client.rpc("is_portfolio_admin");if(auth.error||auth.data!==true){await client.auth.signOut();msg.textContent="This account is not authorized.";return;}
    var b=await client.rpc("cms_bootstrap_portfolio_site");if(b.error||!b.data){msg.textContent="Could not connect to the portfolio CMS.";return;}siteId=b.data;
    var p=await client.from("cms_pages").select("id").eq("site_id",siteId).eq("slug","home").maybeSingle();if(p.error||!p.data){msg.textContent="Website structure is not synced yet. Open the existing admin workspace once, then retry.";return;}pageId=p.data.id;
    var r=await client.from("cms_sections").select("id,section_key,title,parent_section_id").eq("site_id",siteId).eq("page_id",pageId);if(r.error){msg.textContent=r.error.message;return;}
    sections.clear();(r.data||[]).forEach(function(x){sections.set(x.section_key,x);});box.remove();start();
  }
  function buildToolbar(){
    toolbar=document.createElement("div");toolbar.id="veToolbar";
    toolbar.innerHTML='<div class="ve-head" id="veTitle">Selected element</div><div class="ve-actions"><button id="veEdit">Edit</button><button id="veAdd" class="alt">Add text</button><button id="veAddMedia" class="alt">Add image / video</button><button id="veMedia" class="alt">Replace image / video</button><button id="vePreview" class="alt">Preview</button><button id="veDraft" class="alt">Save draft</button><button id="vePublish">Publish</button><button id="veExit" class="alt">Viewer page</button></div><div class="ve-editbox" id="veEditBox"><textarea id="veText"></textarea><input id="veUrl" type="url" placeholder="Paste destination URL" style="display:none;margin-top:7px"><input id="veFile" type="file" accept="image/*,video/*" style="display:none;margin-top:7px"><div class="ve-actions" style="margin-top:7px"><button id="veApply">Apply</button><button id="veCancel" class="alt">Cancel</button></div></div><div class="ve-request" id="veRequest" style="display:none;padding:8px 3px"><label for="veInstruction" style="display:block;color:#f2ca68;font-weight:800;margin-bottom:6px">Instruction / comment for this selection</label><textarea id="veInstruction" placeholder="Describe what should change, or leave feedback for this section…" style="width:100%;box-sizing:border-box;min-height:90px;padding:9px;border-radius:8px;border:1px solid #6f6088;background:#261b39;color:#fff;font:13px system-ui"></textarea><div class="ve-actions" style="margin-top:7px"><button id="veSaveNote">Save requirement</button><button id="veCloseNote" class="alt">Close</button></div><div style="font-size:11px;color:#c9bfd8;margin-top:6px">Saved as a private draft note. It does not change the live website.</div></div><div class="ve-status" id="veStatus" role="status"></div>';
    document.body.appendChild(toolbar);statusNode=toolbar.querySelector("#veStatus");
    toolbar.querySelector("#veEdit").onclick=editSelected;
    toolbar.querySelector("#veAdd").onclick=addContent;
    var reqButton=document.createElement("button");reqButton.id="veRequirement";reqButton.className="alt";reqButton.textContent="Add requirement / comment";toolbar.querySelector(".ve-actions").appendChild(reqButton);
    reqButton.onclick=function(){toolbar.querySelector("#veRequest").style.display="block";toolbar.querySelector("#veInstruction").focus();positionToolbar(selected);};
    toolbar.querySelector("#veAddMedia").onclick=addMediaBlock;
    toolbar.querySelector("#veMedia").onclick=function(){var input=toolbar.querySelector("#veFile");input.click();};
    toolbar.querySelector("#veFile").onchange=function(){if(this.files&&this.files[0])uploadMedia(this.files[0]);};
    toolbar.querySelector("#veApply").onclick=applyEdit;
    toolbar.querySelector("#veCancel").onclick=cancelEdit;
    toolbar.querySelector("#veSaveNote").onclick=saveInstruction;
    toolbar.querySelector("#veCloseNote").onclick=function(){toolbar.querySelector("#veRequest").style.display="none";};
    toolbar.querySelector("#vePreview").onclick=previewDraft;
    toolbar.querySelector("#veDraft").onclick=function(){save("draft");};
    toolbar.querySelector("#vePublish").onclick=function(){save("published");};
    toolbar.querySelector("#veExit").onclick=async function(){await client.auth.signOut();location.href=location.pathname;};
  }
  function positionToolbar(el){var r=el.getBoundingClientRect(),w=toolbar.offsetWidth||340,h=toolbar.offsetHeight||160;var left=Math.max(12,Math.min(window.innerWidth-w-12,r.left));var top=r.bottom+h+14<window.innerHeight?r.bottom+10:Math.max(12,r.top-h-10);toolbar.style.left=left+"px";toolbar.style.top=top+"px";}
  async function select(el){
    var root=rootFor(el);if(!root||!sections.has(root.id)){say("This area is not yet mapped to a CMS section.");return;}
    if(selected)selected.classList.remove("ve-selected");selected=el;selectedSection=sections.get(root.id);selected.classList.add("ve-selected");
    var key=keyFor(el,root);toolbar.querySelector("#veTitle").textContent=(selectedSection.title||root.id)+" · "+kindOf(el);
    toolbar.querySelector("#veMedia").style.display=(kindOf(el)==="image"||kindOf(el)==="video")?"inline-block":"none";
    toolbar.querySelector("#veUrl").style.display=kindOf(el)==="link"?"block":"none";
    toolbar.querySelector("#veText").value=valueOf(el);toolbar.querySelector("#veUrl").value=kindOf(el)==="link"?valueOf(el):"";
    toolbar.querySelector("#veEditBox").style.display="none";toolbar.querySelector("#veRequest").style.display="none";editing=false;toolbar.style.display="block";positionToolbar(el);
    var found=await client.from("cms_content").select("id,status,payload").eq("site_id",siteId).eq("section_id",selectedSection.id).eq("slug","visual:"+key).eq("status","draft").order("updated_at",{ascending:false}).limit(1).maybeSingle();
    selectedRecord=found.data||null;selectedMedia=null;say(selectedRecord?"Draft exists for this element.":"Selected. Choose an action.");
  }
  async function previewDraft(){if(!selected){say("Select an item first.");return;}cancelEdit();if(!selectedRecord||!selectedRecord.payload){say("No saved draft for this item yet. Your current on-page changes are already previewed.");return;}var p=selectedRecord.payload;if(p.media_id){var m=await client.from("cms_media").select("storage_path,media_type").eq("id",p.media_id).maybeSingle();if(m.data){var signed=await client.storage.from(BUCKET).createSignedUrl(m.data.storage_path,3600);if(!signed.error)apply(selected,m.data.media_type==="video"?"video":"image",signed.data.signedUrl);}}else apply(selected,p.element_kind,p.element_value);say("Saved draft preview loaded on the actual page. It is still private.");}
  function editSelected(){if(!selected)return;if(selected===rootFor(selected)||selected.matches("article,main,header,footer,nav")){say("This is a layout/container selection. Use Add requirement to describe the structural change; choose a text or media item for direct editing.");return;}editing=true;var box=toolbar.querySelector("#veEditBox");box.style.display="block";var k=kindOf(selected);toolbar.querySelector("#veText").style.display=k==="text"?"block":"none";toolbar.querySelector("#veUrl").style.display=k==="link"?"block":"none";toolbar.querySelector("#veText").value=valueOf(selected);toolbar.querySelector("#veUrl").value=k==="link"?valueOf(selected):"";if(k==="text"){selected.contentEditable="true";selected.focus();}say("Edit directly on the page, or use the field here. Apply when finished.");positionToolbar(selected);}
  function applyEdit(){if(!selected)return;var k=kindOf(selected);if(k==="text"){selected.contentEditable="false";}else if(k==="link")apply(selected,k,toolbar.querySelector("#veUrl").value.trim());else return;say("Changes previewed on the page. Save as draft or publish.");}
  async function saveInstruction(){
    if(!selected||!selectedSection)return;
    var note=toolbar.querySelector("#veInstruction").value.trim();
    if(!note){say("Write an instruction or comment first.");return;}
    var user=await client.auth.getUser();
    var key=keyFor(selected,rootFor(selected));
    var payload={visual_editor:true,visual_editor_note:true,element_key:key,element_kind:"instruction",element_value:note,selection_tag:selected.tagName.toLowerCase(),selection_label:(selectedSection.title||rootFor(selected).id)};
    var result=await client.from("cms_content").insert({site_id:siteId,page_id:pageId,section_id:selectedSection.id,title:"Editor requirement: "+(selectedSection.title||rootFor(selected).id),slug:"visual-note:"+key+":"+Date.now(),payload:payload,status:"draft",sort_order:0});
    if(result.error){say("Requirement could not be saved: "+result.error.message);return;}
    toolbar.querySelector("#veInstruction").value="";
    say("Requirement saved privately as a draft note. It has not changed the website.");
  }
  function cancelEdit(){if(!selected)return;selected.contentEditable="false";toolbar.querySelector("#veEditBox").style.display="none";toolbar.querySelector("#veText").value=valueOf(selected);say("Edit controls closed. Current page is your preview.");}
  async function addContent(){
    if(!selected||!selectedSection)return;var root=rootFor(selected),node=document.createElement("p");node.textContent="New content — click Edit to change this text.";node.setAttribute("data-ve-new-content","true");root.appendChild(node);selected=node;await select(node);editSelected();say("New paragraph added at the end of this section. Edit it, then save as draft.");
  }
  async function addMediaBlock(){if(!selected)return;var root=rootFor(selected),node=document.createElement("img");node.alt="New portfolio image";node.setAttribute("data-ve-new-content","true");node.style.maxWidth="100%";node.style.height="auto";root.appendChild(node);selected=node;await select(node);toolbar.querySelector("#veFile").click();say("Choose an image or video file to add to this section.");}
  async function uploadMedia(file){
    if(!selected||!selectedSection)return;var type=file.type.indexOf("video/")===0?"video":"image";if(type==="image"&&!file.type.startsWith("image/")){say("Choose an image or video file.");return;}
    say("Uploading media…");var safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"-"),path=siteId+"/"+selectedSection.id+"/"+Date.now()+"-"+safe;
    var up=await client.storage.from(BUCKET).upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type||undefined});if(up.error){say("Upload failed: "+up.error.message);return;}
    var user=await client.auth.getUser();var row=await client.from("cms_media").insert({site_id:siteId,page_id:pageId,section_id:selectedSection.id,storage_path:path,media_type:type,title:file.name,mime_type:file.type,file_size:file.size,status:"draft",created_by:user.data.user.id}).select("id,storage_path,media_type").single();
    if(row.error){await client.storage.from(BUCKET).remove([path]);say("Media record failed: "+row.error.message);return;}
    selectedMedia=row.data;var signed=await client.storage.from(BUCKET).createSignedUrl(path,3600);if(signed.error){say("Upload saved, but preview URL failed: "+signed.error.message);return;}
    if(type==="video"&&selected.tagName!=="VIDEO"){var video=document.createElement("video");video.controls=true;video.preload="metadata";if(selected.hasAttribute("data-ve-new-content"))video.setAttribute("data-ve-new-content","true");selected.replaceWith(video);selected=video;selected.className="";keyFor(selected,rootFor(selected));}
    apply(selected,type,signed.data.signedUrl);say("Media uploaded as a draft and previewed. Save this element as a draft; publish will publish both.");
  }
  async function save(status){
    if(!selected||!selectedSection)return;selected.contentEditable="false";var root=rootFor(selected),key=keyFor(selected,root),kind=kindOf(selected);
    var payload={visual_editor:true,element_key:key,element_kind:kind,element_value:valueOf(selected),is_new_content:selected.hasAttribute("data-ve-new-content"),element_tag:selected.tagName.toLowerCase()};
    if(selectedMedia)payload.media_id=selectedMedia.id;
    var data={site_id:siteId,page_id:pageId,section_id:selectedSection.id,title:"Visual edit: "+key,slug:"visual:"+key,payload:payload,status:status,sort_order:0,published_at:status==="published"?new Date().toISOString():null};
    var result=selectedRecord&&selectedRecord.id?await client.from("cms_content").update(data).eq("id",selectedRecord.id).select("id,status,payload").single():await client.from("cms_content").insert(data).select("id,status,payload").single();
    if(result.error){say("Save failed: "+result.error.message);return;}
    selectedRecord=result.data;
    if(selectedMedia){var mr=await client.from("cms_media").update({status:status,published_at:status==="published"?new Date().toISOString():null}).eq("id",selectedMedia.id);if(mr.error){say("Content saved, but media status update failed: "+mr.error.message);return;}}
    selectedMedia=null;toolbar.querySelector("#veEditBox").style.display="none";
    say(status==="published"?"Published. Return to the viewer page to check the public result.":"Draft saved. It remains private until published.");
  }
  function start(){
    styles();document.body.classList.add("ve-editing");buildToolbar();
    document.addEventListener("click",function(e){if(e.target.closest("#veToolbar"))return;var el=e.target.closest("h1,h2,h3,h4,p,a,button,img,video,source,li,span,section,.topic");if(!el||!rootFor(el))return;e.preventDefault();e.stopPropagation();select(el);},true);
    window.addEventListener("scroll",function(){if(selected&&toolbar.style.display==="block")positionToolbar(selected);},{passive:true});
    window.addEventListener("resize",function(){if(selected&&toolbar.style.display==="block")positionToolbar(selected);});
    say("Select any item on the page to open its editing options.");
  }
  async function loadPublished(){
    var pub=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    var q=await pub.from("cms_content").select("slug,payload,updated_at").eq("status","published").order("updated_at",{ascending:false});if(q.error)return;
    var done=new Set();for(var row of(q.data||[])){if(done.has(row.slug))continue;done.add(row.slug);var p=row.payload||{};if(!p.visual_editor||!p.element_key)continue;
      var el=document.querySelector('[data-ve-key="'+CSS.escape(p.element_key)+'"]');if(!el){var rid=String(p.element_key).split("__")[0],root=document.getElementById(rid);if(!root)continue;var nodes=root.querySelectorAll("h1,h2,h3,h4,p,a,button,img,video,source,li,span");nodes.forEach(function(n){if(keyFor(n,root)===p.element_key)el=n;});if(!el&&p.is_new_content){el=document.createElement(p.element_tag||"p");el.setAttribute("data-ve-key",p.element_key);el.setAttribute("data-ve-new-content","true");root.appendChild(el);}}
      if(p.media_id){var media=await pub.from("cms_media").select("storage_path,media_type").eq("id",p.media_id).eq("status","published").maybeSingle();if(media.data){var signed=await pub.storage.from(BUCKET).createSignedUrl(media.data.storage_path,3600);if(!signed.error)apply(el,media.data.media_type==="video"?"video":"image",signed.data.signedUrl);continue;}}
      apply(el,p.element_kind,p.element_value);
    }
  }
  function boot(){adminLink();if(!window.supabase||!window.supabase.createClient)return;if(editMode){styles();client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});login();client.auth.getSession().then(function(r){if(r.data&&r.data.session){var box=document.getElementById("veLogin"),msg=box&&box.querySelector("#veLoginMsg");authorize(box,msg||{set textContent(v){}});}});}else loadPublished();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();