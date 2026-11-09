// Universal section media & resource manager.
// Shared by every main section and subsection editor. Uses the private cms-media bucket.
(function () {
  "use strict";

  const BUCKET = "cms-media";
  let currentKey = null;
  let currentSection = null;
  let currentFolder = null;
  let files = [];
  let records = [];
  let sectionRows = [];

  const client = function () { return window.portfolioSupabaseClient; };
  const site = function () { return window.portfolioCmsSiteId; };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function say(message, isError) {
    const element = document.getElementById("sectionResourcesMessage");
    if (!element) return;
    element.textContent = message;
    element.className = "page-message " + (isError ? "error" : "success");
  }

  function fileIcon(row) {
    const mime = String(row.mime_type || "").toLowerCase();
    const name = String(row.title || "").toLowerCase();
    if (mime.indexOf("image/") === 0) return "🖼️";
    if (mime.indexOf("video/") === 0) return "🎬";
    if (mime.indexOf("audio/") === 0) return "🎵";
    if (mime.indexOf("pdf") !== -1 || name.endsWith(".pdf")) return "📕";
    if (/\.(docx?|odt|rtf)$/.test(name)) return "📝";
    if (/\.(xlsx?|csv|ods)$/.test(name)) return "📊";
    if (/\.(pptx?|odp)$/.test(name)) return "📽️";
    if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/.test(name)) return "🗜️";
    return "📄";
  }

  function sizeLabel(size) {
    const value = Number(size || 0);
    if (value < 1024) return value + " B";
    if (value < 1048576) return (value / 1024).toFixed(1) + " KB";
    return (value / 1048576).toFixed(1) + " MB";
  }

  function folderForFile(row) {
    const description = String(row.description || "");
    return description.indexOf("folder:") === 0 ? (description.slice(7) || null) : null;
  }

  function folderTrail() {
    const trail = [];
    let id = currentFolder;
    let guard = 0;
    while (id && guard < 100) {
      guard += 1;
      const folder = records.find(function (row) {
        return row.id === id && row.payload && row.payload.resource_kind === "folder";
      });
      if (!folder) break;
      trail.unshift(folder);
      id = folder.payload.parent_folder_id || null;
    }
    return trail;
  }

  function mount(key) {
    const panel = document.getElementById("contentPanel");
    if (!panel) return Promise.resolve();
    let host = document.getElementById("sectionResources");
    if (!host) {
      const placeholder =
        '<div id="sectionResources"><section class="section-resources-card">' +
        '<h3>Section media & resources</h3><p class="form-hint">Preparing the file manager…</p>' +
        '</section></div>';
      // Keep the manager near the top of every section. Legacy main-section
      // editors can be long, which previously pushed this shared panel below
      // the editor and made it appear to be missing.
      const heading = panel.querySelector(".section-heading");
      if (heading) heading.insertAdjacentHTML("afterend", placeholder);
      else panel.insertAdjacentHTML("afterbegin", placeholder);
    }
    return load(key);
  }

  async function load(key) {
    currentKey = key;
    currentFolder = null;
    currentSection = null;
    files = [];
    records = [];

    const host = document.getElementById("sectionResources");
    if (!host) return;

    if (!site() || !client()) {
      host.innerHTML = '<section class="section-resources-card"><h3>Section media & resources</h3>' +
        '<p class="form-hint">The CMS site connection is not available. Refresh the admin dashboard. ' +
        'If this message remains, the site bootstrap or CMS connection needs attention.</p></section>';
      return;
    }

    host.innerHTML = '<div class="loading-state">Loading section resources…</div>';
    try {
      let query = client().from("cms_sections")
        .select("id,page_id,title")
        .eq("site_id", site())
        .eq("section_key", key);
      const pageId = (window.portfolioCmsStructureSynced || {}).pageId;
      if (pageId) query = query.eq("page_id", pageId);
      const [sectionResult, hierarchyResult] = await Promise.all([
        query.maybeSingle(),
        client().from("cms_sections")
          .select("id,section_key,title,parent_section_id,sort_order")
          .eq("site_id", site())
          .eq("page_id", pageId)
          .order("sort_order", { ascending: true })
      ]);
      if (sectionResult.error) throw sectionResult.error;
      if (hierarchyResult.error) throw hierarchyResult.error;
      sectionRows = hierarchyResult.data || [];
      if (!sectionResult.data) {
        host.innerHTML = '<section class="section-resources-card"><h3>Section media & resources</h3>' +
          '<p class="form-hint">This section has not synced to the resource library yet. Refresh the admin dashboard ' +
          'and try again. Existing content has not been changed.</p></section>';
        return;
      }
      currentSection = sectionResult.data;
      await refresh();
    } catch (error) {
      host.innerHTML = '<section class="section-resources-card"><h3>Section media & resources</h3>' +
        '<p class="form-hint">Resources could not load: ' + esc(error.message || "Unknown error") + '</p></section>';
    }
  }

  async function refresh() {
    if (!currentSection) return;
    const results = await Promise.all([
      client().from("cms_media").select("*")
        .eq("site_id", site()).eq("section_id", currentSection.id)
        .order("created_at", { ascending: false }),
      client().from("cms_content").select("*")
        .eq("site_id", site()).eq("section_id", currentSection.id)
        .order("created_at", { ascending: false })
    ]);
    if (results[0].error) throw results[0].error;
    if (results[1].error) throw results[1].error;
    files = results[0].data || [];
    records = (results[1].data || []).filter(function (row) {
      return row.payload && ["folder", "link"].indexOf(row.payload.resource_kind) !== -1;
    });
    render();
  }

  function render() {
    const host = document.getElementById("sectionResources");
    if (!host) return;

    const folders = records.filter(function (row) {
      return row.payload.resource_kind === "folder" &&
        (row.payload.parent_folder_id || null) === (currentFolder || null);
    });
    const links = records.filter(function (row) {
      return row.payload.resource_kind === "link" &&
        (row.payload.parent_folder_id || null) === (currentFolder || null);
    });
    const media = files.filter(function (row) {
      return folderForFile(row) === (currentFolder || null);
    });
    const trail = folderTrail();

    function destinationLabel(row) {
      const names = [row.title];
      let parentId = row.parent_section_id;
      let guard = 0;
      while (parentId && guard < 30) {
        guard += 1;
        const parent = sectionRows.find(function (candidate) { return candidate.id === parentId; });
        if (!parent) break;
        names.unshift(parent.title);
        parentId = parent.parent_section_id;
      }
      return names.join(" / ");
    }
    const destinationOptions = sectionRows.map(function (row) {
      return '<option value="' + esc(row.section_key) + '"' +
        (row.section_key === currentKey ? ' selected' : '') + '>' +
        esc(destinationLabel(row)) + '</option>';
    }).join("");
    const selectedDestination = sectionRows.find(function (row) { return row.section_key === currentKey; });
    const destinationPicker = '<section class="section-resources-card resource-destination-card">' +
      '<label for="resourceDestinationSelect"><strong>Exact website destination</strong></label>' +
      '<select id="resourceDestinationSelect" class="resource-destination-select">' +
      destinationOptions + '</select><p class="form-hint">Every upload, folder, link and publish action below applies only to this selected website section.</p>' +
      '<p class="form-hint"><strong>Selected destination:</strong> ' +
      esc(selectedDestination ? destinationLabel(selectedDestination) : currentSection.title) +
      '</p></section>';
    const breadcrumbs = '<button class="secondary-button" type="button" id="resourceRoot">All section resources</button>' +
      trail.map(function (folder) {
        return '<span aria-hidden="true">/</span><button class="secondary-button" type="button" data-open-folder="' +
          esc(folder.id) + '">' + esc(folder.title) + '</button>';
      }).join("");

    const folderHtml = folders.map(function (row) {
      return '<div class="resource-row"><span class="resource-file-icon">📁</span>' +
        '<div class="resource-file-info"><strong>' + esc(row.title) + '</strong><span>Folder</span></div>' +
        '<button class="secondary-button" type="button" data-open-folder="' + esc(row.id) + '">Open</button>' +
        '<button class="secondary-button" type="button" data-rename-resource="' + esc(row.id) + '">Rename</button>' +
        '<button class="danger-button" type="button" data-delete-resource="' + esc(row.id) + '">Delete</button></div>';
    }).join("");

    const linkHtml = links.map(function (row) {
      return '<div class="resource-row"><span class="resource-file-icon">🔗</span>' +
        '<div class="resource-file-info"><strong>' + esc(row.title) + '</strong><span>Web link · ' +
        esc(row.status || "draft") + '</span></div>' +
        '<button class="secondary-button" type="button" data-toggle-link-publish="' + esc(row.id) + '">' +
        (row.status === "published" ? "Unpublish" : "Publish") + '</button>' +
        '<a href="' + esc(row.payload.url) + '" target="_blank" rel="noopener noreferrer">Open link ↗</a>' +
        '<button class="secondary-button" type="button" data-rename-resource="' + esc(row.id) + '">Rename</button>' +
        '<button class="danger-button" type="button" data-delete-resource="' + esc(row.id) + '">Delete</button></div>';
    }).join("");

    const mediaHtml = media.map(function (row) {
      return '<div class="resource-row"><span class="resource-file-icon">' + fileIcon(row) + '</span>' +
        '<div class="resource-file-info"><strong>' + esc(row.title) + '</strong><span>' +
        esc(row.mime_type || "Unknown file type") + ' · ' + sizeLabel(row.file_size) + ' · ' +
        esc(row.status || "draft") + '</span></div>' +
        '<button class="secondary-button" type="button" data-toggle-media-publish="' + esc(row.id) + '">' +
        (row.status === "published" ? "Unpublish" : "Publish") + '</button>' +
        '<button class="secondary-button" type="button" data-resource-preview="' + esc(row.id) + '">Preview</button>' +
        '<button class="secondary-button" type="button" data-resource-open="' + esc(row.id) + '">Open</button>' +
        '<button class="secondary-button" type="button" data-resource-download="' + esc(row.id) + '">Download</button>' +
        '<button class="secondary-button" type="button" data-rename-file="' + esc(row.id) + '">Rename</button>' +
        '<button class="danger-button" type="button" data-delete-file="' + esc(row.id) + '">Delete</button></div>';
    }).join("");

    host.innerHTML = destinationPicker +
      '<section class="section-resources-card">' +
      '<div class="resource-heading"><div><h3>Section media & resources</h3>' +
      '<p class="cms-help">A separate file manager for this section. Upload images, videos, PDFs, Word/Excel/PowerPoint ' +
      'files, audio, archives and other file types. Create folders, subfolders and web links.</p></div>' +
      '<span class="resource-count">' + files.length + ' files</span></div>' +
      '<div id="sectionResourcesMessage" class="page-message" role="status" aria-live="polite"></div>' +
      '<div class="resource-dropzone" id="resourceDropzone">' +
      '<div class="resource-drop-icon">⇧</div><strong>Drag and drop files here</strong>' +
      '<span>or click to browse · multiple files supported · any file type</span>' +
      '<input id="resourceFiles" type="file" multiple aria-label="Choose any files to upload"></div>' +
      '<div class="resource-toolbar"><div class="resource-create-folder">' +
      '<input id="resourceFolderName" type="text" maxlength="180" placeholder="New folder or subfolder name">' +
      '<button class="secondary-button" type="button" id="resourceCreateFolder">Create folder</button></div>' +
      '<div class="resource-create-link"><input id="resourceLinkTitle" type="text" maxlength="180" placeholder="Link title">' +
      '<input id="resourceLinkUrl" type="url" placeholder="https://…">' +
      '<button class="secondary-button" type="button" id="resourceAddLink">Add link</button></div></div>' +
      '<div class="resource-breadcrumb" aria-label="Folder path">' + breadcrumbs + '</div>' +
      '<div id="resourceUploadStatus" class="resource-upload-status" aria-live="polite"></div>' +
      '<div class="resource-items">' + folderHtml + linkHtml + mediaHtml +
      ((!folderHtml && !linkHtml && !mediaHtml)
        ? '<p class="empty-state">No resources in this folder yet. Drop files above or create a folder or link.</p>' : "") +
      '</div><dialog id="resourcePreviewDialog" class="resource-preview-dialog">' +
      '<div class="resource-preview-head"><strong id="resourcePreviewTitle">Media preview</strong>' +
      '<button type="button" class="secondary-button" id="resourcePreviewClose">Close</button></div>' +
      '<div id="resourcePreviewBody" class="resource-preview-body"></div></dialog></section>';
  }

  async function createRecord(kind, title, payload) {
    const result = await client().from("cms_content").insert({
      site_id: site(),
      page_id: currentSection.page_id,
      section_id: currentSection.id,
      title: title,
      slug: null,
      payload: Object.assign({
        resource_kind: kind,
        parent_folder_id: currentFolder
      }, payload),
      status: "draft",
      sort_order: 0
    });
    if (result.error) throw result.error;
    await refresh();
  }

  async function upload(fileList) {
    const items = Array.from(fileList || []);
    if (!items.length || !currentSection) return;

    const status = document.getElementById("resourceUploadStatus");
    let uploadedCount = 0;
    const failures = [];

    for (let index = 0; index < items.length; index += 1) {
      const file = items[index];
      if (status) status.textContent = "Uploading " + (index + 1) + " of " + items.length + ": " + file.name;
      let path = null;
      try {
        const auth = await client().auth.getUser();
        if (auth.error || !auth.data || !auth.data.user) {
          throw new Error("Your administrator session has expired. Sign in again and retry.");
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-180);
        path = site() + "/" + currentSection.id + "/" + Date.now() + "-" +
          Math.random().toString(36).slice(2, 9) + "-" + safeName;

        const uploadResult = await client().storage.from(BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream"
        });
        if (uploadResult.error) throw new Error(uploadResult.error.message);

        const mime = String(file.type || "").toLowerCase();
        const mediaType = mime.indexOf("image/") === 0 ? "image" :
          mime.indexOf("video/") === 0 ? "video" :
          mime.indexOf("audio/") === 0 ? "audio" : "document";

        const insertResult = await client().from("cms_media").insert({
          site_id: site(),
          page_id: currentSection.page_id,
          section_id: currentSection.id,
          storage_path: path,
          media_type: mediaType,
          title: file.name,
          description: "folder:" + (currentFolder || ""),
          mime_type: file.type || "application/octet-stream",
          file_size: file.size,
          status: "draft",
          created_by: auth.data.user.id
        });
        if (insertResult.error) {
          await client().storage.from(BUCKET).remove([path]);
          path = null;
          throw new Error("The file uploaded but its resource record could not be saved: " + insertResult.error.message);
        }
        uploadedCount += 1;
      } catch (error) {
        failures.push(file.name + ": " + (error.message || "Upload failed"));
      }
    }

    try {
      await refresh();
    } catch (error) {
      say("Upload processing finished, but the resource list could not refresh: " +
        (error.message || "Unknown error"), true);
      return;
    }

    if (failures.length) {
      say(uploadedCount + " of " + items.length + " file(s) uploaded. " + failures.join(" | "), true);
    } else {
      say(uploadedCount + " file(s) uploaded successfully.");
    }
  }

  async function createFolder() {
    const input = document.getElementById("resourceFolderName");
    const title = input ? input.value.trim() : "";
    if (!title) {
      say("Enter a folder name first.", true);
      return;
    }
    await createRecord("folder", title, {});
    say("Folder created.");
  }

  async function addLink() {
    const titleInput = document.getElementById("resourceLinkTitle");
    const urlInput = document.getElementById("resourceLinkUrl");
    const title = titleInput ? titleInput.value.trim() : "";
    const url = urlInput ? urlInput.value.trim() : "";
    if (!title || !/^https?:\/\//i.test(url)) {
      say("Enter a link title and a valid http or https URL.", true);
      return;
    }
    await createRecord("link", title, { url: url });
    say("Link saved.");
  }

  function descendantFolderIds(rootId) {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      records.forEach(function (row) {
        if (row.payload && row.payload.resource_kind === "folder" &&
            row.payload.parent_folder_id && ids.has(row.payload.parent_folder_id) && !ids.has(row.id)) {
          ids.add(row.id);
          changed = true;
        }
      });
    }
    return ids;
  }

  async function deleteFolderTree(rootId) {
    const folderIds = descendantFolderIds(rootId);
    const contentRows = records.filter(function (row) {
      return folderIds.has(row.id) || (row.payload && folderIds.has(row.payload.parent_folder_id));
    });
    const mediaRows = files.filter(function (row) {
      return folderIds.has(folderForFile(row));
    });
    const paths = mediaRows.map(function (row) { return row.storage_path; });

    for (let index = 0; index < paths.length; index += 100) {
      const removed = await client().storage.from(BUCKET).remove(paths.slice(index, index + 100));
      if (removed.error) throw removed.error;
    }

    if (mediaRows.length) {
      const mediaDelete = await client().from("cms_media").delete()
        .in("id", mediaRows.map(function (row) { return row.id; }));
      if (mediaDelete.error) throw mediaDelete.error;
    }

    if (contentRows.length) {
      const contentDelete = await client().from("cms_content").delete()
        .in("id", contentRows.map(function (row) { return row.id; }));
      if (contentDelete.error) throw contentDelete.error;
    }
  }

  async function previewFile(row) {
    const result = await client().storage.from(BUCKET).createSignedUrl(row.storage_path, 3600);
    if (result.error) throw result.error;
    const dialog = document.getElementById("resourcePreviewDialog");
    const body = document.getElementById("resourcePreviewBody");
    const title = document.getElementById("resourcePreviewTitle");
    if (!dialog || !body) throw new Error("Preview panel is not available. Refresh the section and try again.");
    const url = result.data.signedUrl;
    const mime = String(row.mime_type || "").toLowerCase();
    body.replaceChildren();
    if (mime.indexOf("image/") === 0) {
      const image = document.createElement("img");
      image.src = url; image.alt = row.title || "Uploaded image";
      body.appendChild(image);
    } else if (mime.indexOf("video/") === 0) {
      const video = document.createElement("video");
      video.src = url; video.controls = true; video.autoplay = false; video.preload = "metadata";
      body.appendChild(video);
    } else if (mime.indexOf("audio/") === 0) {
      const audio = document.createElement("audio");
      audio.src = url; audio.controls = true; body.appendChild(audio);
    } else if (mime === "application/pdf" || String(row.title || "").toLowerCase().endsWith(".pdf")) {
      const frame = document.createElement("iframe");
      frame.src = url; frame.title = "PDF preview"; body.appendChild(frame);
    } else {
      const note = document.createElement("p");
      note.textContent = "This file type may not support an in-page preview. Use Open to view it in a new tab, or Download to save it.";
      body.appendChild(note);
    }
    if (title) title.textContent = row.title || "Media preview";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else window.open(url, "_blank", "noopener");
  }

  async function openFile(row, forceDownload) {
    // Reserve the new tab synchronously during the click gesture so popup blockers
    // do not discard the later signed-URL navigation.
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      throw new Error("Your browser blocked the new tab. Allow pop-ups for this admin site and try again.");
    }
    popup.opener = null;
    const options = forceDownload ? { download: row.title } : { download: false };
    const result = await client().storage.from(BUCKET)
      .createSignedUrl(row.storage_path, 3600, options);
    if (result.error) {
      popup.close();
      throw result.error;
    }
    popup.location.href = result.data.signedUrl;
  }

  async function action(event) {
    const button = event.target.closest("button");
    if (!button) return;

    try {
      if (button.id === "resourceCreateFolder") {
        await createFolder();
      } else if (button.id === "resourceAddLink") {
        await addLink();
      } else if (button.id === "resourceRoot") {
        currentFolder = null;
        render();
      } else if (button.dataset.openFolder) {
        currentFolder = button.dataset.openFolder;
        render();
      } else if (button.dataset.renameResource) {
        const row = records.find(function (item) { return item.id === button.dataset.renameResource; });
        if (!row) return;
        const title = window.prompt("New display name", row.title);
        if (title && title.trim()) {
          const result = await client().from("cms_content").update({ title: title.trim() }).eq("id", row.id);
          if (result.error) throw result.error;
          await refresh();
        }
      } else if (button.dataset.deleteResource) {
        const row = records.find(function (item) { return item.id === button.dataset.deleteResource; });
        if (!row) return;
        const isFolder = row.payload && row.payload.resource_kind === "folder";
        const promptText = isFolder
          ? "Delete folder \"" + row.title + "\" and all of its subfolders, links and files?"
          : "Delete link \"" + row.title + "\"?";
        if (window.confirm(promptText)) {
          if (isFolder) await deleteFolderTree(row.id);
          else {
            const result = await client().from("cms_content").delete().eq("id", row.id);
            if (result.error) throw result.error;
          }
          await refresh();
          say(isFolder ? "Folder and its contents deleted." : "Link deleted.");
        }
      } else if (button.dataset.toggleMediaPublish) {
        const row = files.find(function (item) { return item.id === button.dataset.toggleMediaPublish; });
        if (!row) return;
        const nextStatus = row.status === "published" ? "draft" : "published";
        const result = await client().from("cms_media").update({
          status: nextStatus,
          published_at: nextStatus === "published" ? new Date().toISOString() : null
        }).eq("site_id", site()).eq("id", row.id);
        if (result.error) throw result.error;
        await refresh();
        say(nextStatus === "published" ? "File published to the public website." : "File unpublished from the public website.");
      } else if (button.dataset.toggleLinkPublish) {
        const row = records.find(function (item) { return item.id === button.dataset.toggleLinkPublish; });
        if (!row) return;
        const nextStatus = row.status === "published" ? "draft" : "published";
        const result = await client().from("cms_content").update({
          status: nextStatus,
          published_at: nextStatus === "published" ? new Date().toISOString() : null
        }).eq("site_id", site()).eq("id", row.id);
        if (result.error) throw result.error;
        await refresh();
        say(nextStatus === "published" ? "Link published to the public website." : "Link unpublished from the public website.");
      } else if (button.dataset.renameFile) {
        const row = files.find(function (item) { return item.id === button.dataset.renameFile; });
        if (!row) return;
        const title = window.prompt("New display name", row.title);
        if (title && title.trim()) {
          const result = await client().from("cms_media").update({ title: title.trim() }).eq("id", row.id);
          if (result.error) throw result.error;
          await refresh();
        }
      } else if (button.dataset.deleteFile) {
        const row = files.find(function (item) { return item.id === button.dataset.deleteFile; });
        if (!row) return;
        if (window.confirm("Delete file \"" + row.title + "\"?")) {
          const removed = await client().storage.from(BUCKET).remove([row.storage_path]);
          if (removed.error) throw removed.error;
          const deleted = await client().from("cms_media").delete().eq("id", row.id);
          if (deleted.error) throw deleted.error;
          await refresh();
          say("File deleted.");
        }
      } else if (button.id === "resourcePreviewClose") {
        const dialog = document.getElementById("resourcePreviewDialog");
        if (dialog && dialog.open) dialog.close();
      } else if (button.dataset.resourcePreview) {
        const row = files.find(function (item) { return item.id === button.dataset.resourcePreview; });
        if (row) await previewFile(row);
      } else if (button.dataset.resourceOpen || button.dataset.resourceDownload) {
        const id = button.dataset.resourceOpen || button.dataset.resourceDownload;
        const row = files.find(function (item) { return item.id === id; });
        if (row) await openFile(row, Boolean(button.dataset.resourceDownload));
      }
    } catch (error) {
      say(error.message || "The resource action failed.", true);
    }
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest("#sectionResources")) action(event);
  });

  document.addEventListener("change", function (event) {
    if (event.target.id === "resourceDestinationSelect" && event.target.value) {
      load(event.target.value);
      return;
    }
    if (event.target.id === "resourceFiles" && event.target.files && event.target.files.length) {
      upload(event.target.files);
      event.target.value = "";
    }
  });

  document.addEventListener("dragover", function (event) {
    if (event.target.closest("#resourceDropzone")) {
      event.preventDefault();
      const zone = document.getElementById("resourceDropzone");
      if (zone) zone.classList.add("drag-over");
    }
  });

  document.addEventListener("dragleave", function (event) {
    if (event.target.closest("#resourceDropzone") &&
        !(event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest("#resourceDropzone"))) {
      const zone = document.getElementById("resourceDropzone");
      if (zone) zone.classList.remove("drag-over");
    }
  });

  document.addEventListener("drop", function (event) {
    if (event.target.closest("#resourceDropzone")) {
      event.preventDefault();
      const zone = document.getElementById("resourceDropzone");
      if (zone) zone.classList.remove("drag-over");
      upload(event.dataTransfer && event.dataTransfer.files).catch(function (error) {
        say(error.message || "Upload failed.", true);
      });
    }
  });

  window.sectionResources = { mount: mount, load: load };
})();
