// Public portfolio CMS integration — published About Me content only.
// Uses the Supabase public publishable/anon key; never use a service-role key here.
(function () {
  "use strict";

  var SUPABASE_URL = "https://lfmbvvwnrhohdifypuyw.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_kwoxePVR6yzu60XODZJhxg_Kngnh01x";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function renderPublishedAbout(records) {
    var section = document.getElementById("about");
    if (!section || !records.length) return;

    var fallback = section.querySelector(":scope > .wrap");
    var mount = document.getElementById("aboutCmsContent");
    if (!mount) return;

    var cards = records.map(function (record) {
      var content = record.content && typeof record.content === "object" ? record.content : {};
      var subtitle = content.subtitle || content.role || content.category || "";
      var description = content.description || content.summary || content.text || "";
      var paragraphs = Array.isArray(content.paragraphs) ? content.paragraphs : [];
      var extras = Object.keys(content).filter(function (key) {
        return !["subtitle", "role", "category", "description", "summary", "text", "paragraphs",
          "image", "imageUrl", "image_url", "imageAlt", "image_alt"].includes(key);
      }).map(function (key) {
        var value = content[key];
        if (value == null || value === "") return "";
        var label = key.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ");
        var text = Array.isArray(value) ? value.join(" · ") :
          (typeof value === "object" ? JSON.stringify(value) : String(value));
        return '<p class="muted"><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(text) + '</p>';
      }).join("");

      return '<article class="block glow-tab">' +
        '<h3>' + escapeHtml(record.title || "About Me") + '</h3>' +
        (subtitle ? '<p class="muted" style="color:#f5c451;margin-top:8px">' + escapeHtml(subtitle) + '</p>' : '') +
        (description ? '<p class="muted">' + escapeHtml(description) + '</p>' : '') +
        paragraphs.map(function (paragraph) {
          return '<p class="muted">' + escapeHtml(paragraph) + '</p>';
        }).join("") + extras + '</article>';
    }).join("");

    mount.innerHTML =
      '<h2 style="font-size:48px;color:#f5c451;margin-bottom:24px">About Me</h2>' + cards;
    if (fallback) fallback.hidden = true;
    mount.hidden = false;
  }

  async function loadPublishedAbout() {
    var section = document.getElementById("about");
    if (!section || !window.supabase || !window.supabase.createClient) return;

    var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
      var result = await client.from("portfolio_content")
        .select("title,content,sort_order,created_at")
        .eq("section_key", "about")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (result.error) {
        console.warn("Portfolio About Me content could not be loaded; showing the original section.", result.error.message);
        return;
      }
      renderPublishedAbout(result.data || []);
    } catch (error) {
      console.warn("Portfolio About Me content could not be loaded; showing the original section.", error);
    }
  }



  // Legacy portfolio_content is still the editor for the original main sections.
  // Render only published records; never expose draft content.
  async function loadPublishedLegacySections() {
    if (!window.supabase || !window.supabase.createClient) return;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    try {
      const result = await client.from("portfolio_content")
        .select("section_key,title,content,sort_order,created_at")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (result.error) throw result.error;

      const groups = new Map();
      (result.data || []).forEach(function (record) {
        const key = record.section_key || "";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(record);
      });

      for (const [key, records] of groups) {
        if (key === "about") {
          renderPublishedAbout(records);
          continue;
        }
        const targetId = key.indexOf("topic__") === 0 ? key.slice(7) : key;
        const target = document.getElementById(targetId);
        if (!target || !records.length) continue;
        let mount = target.querySelector(":scope > .legacy-published-content");
        if (!mount) {
          mount = document.createElement("div");
          mount.className = "legacy-published-content wrap";
          mount.setAttribute("aria-label", "Published portfolio content");
          target.appendChild(mount);
        }

        for (const record of records) {
          const content = record.content && typeof record.content === "object" ? record.content : {};
          const card = document.createElement("article");
          card.className = "block glow-tab";
          const heading = document.createElement("h3");
          heading.textContent = record.title || "Portfolio entry";
          card.appendChild(heading);

          const subtitle = content.subtitle || content.role || content.category || "";
          if (subtitle) {
            const sub = document.createElement("p");
            sub.className = "muted";
            sub.textContent = String(subtitle);
            card.appendChild(sub);
          }
          const description = content.description || content.summary || content.text || "";
          if (description) {
            const paragraph = document.createElement("p");
            paragraph.className = "muted";
            paragraph.textContent = String(description);
            card.appendChild(paragraph);
          }
          if (Array.isArray(content.paragraphs)) {
            content.paragraphs.forEach(function (value) {
              const paragraph = document.createElement("p");
              paragraph.className = "muted";
              paragraph.textContent = String(value);
              card.appendChild(paragraph);
            });
          }

          const mediaWrap = document.createElement("div");
          mediaWrap.className = "cms-published-media";
          const imageUrl = content.image || content.imageUrl || content.image_url || "";
          if (typeof imageUrl === "string" && /^https?:\/\//i.test(imageUrl)) {
            const image = document.createElement("img");
            image.src = imageUrl;
            image.alt = content.imageAlt || content.image_alt || record.title || "";
            image.loading = "lazy";
            image.style.maxWidth = "100%";
            image.style.height = "auto";
            mediaWrap.appendChild(image);
          }

          // Existing legacy uploads use the private portfolio-media bucket.
          // A signed URL is shown only if the bucket's current read policy permits it.
          if (Array.isArray(content.media_files)) {
            for (const file of content.media_files) {
              if (!file || typeof file.path !== "string" || file.path.indexOf("..") !== -1 ||
                  file.path.startsWith("/")) continue;
              const signed = await client.storage.from("portfolio-media").createSignedUrl(file.path, 3600);
              if (signed.error || !signed.data) continue;
              if (file.type === "video" || /^video\//i.test(file.mime_type || "")) {
                const video = document.createElement("video");
                video.src = signed.data.signedUrl;
                video.controls = true;
                video.preload = "metadata";
                video.style.maxWidth = "100%";
                mediaWrap.appendChild(video);
              } else {
                const image = document.createElement("img");
                image.src = signed.data.signedUrl;
                image.alt = file.name || record.title || "";
                image.loading = "lazy";
                image.style.maxWidth = "100%";
                image.style.height = "auto";
                mediaWrap.appendChild(image);
              }
            }
          }
          if (mediaWrap.childNodes.length) card.appendChild(mediaWrap);

          const known = new Set(["subtitle","role","category","description","summary","text",
            "paragraphs","image","imageUrl","image_url","imageAlt","image_alt","media_files"]);
          Object.keys(content).forEach(function (keyName) {
            if (known.has(keyName) || content[keyName] == null || content[keyName] === "") return;
            const extra = document.createElement("p");
            extra.className = "muted";
            const label = keyName.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ");
            const value = Array.isArray(content[keyName]) ? content[keyName].join(" · ") :
              (typeof content[keyName] === "object" ? JSON.stringify(content[keyName]) : String(content[keyName]));
            extra.textContent = label + ": " + value;
            card.appendChild(extra);
          });
          mount.appendChild(card);
        }
      }
    } catch (error) {
      console.warn("Published portfolio content could not be loaded; the original website content remains visible.", error);
    }
  }

  // Render only explicitly published multi-site CMS entries. Drafts remain private.
  // Render published multi-site CMS entries and standalone section resources.
  // Draft content and draft media are never queried by this public client.
  async function loadPublishedCmsSections() {
    if (!window.supabase || !window.supabase.createClient) return;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    try {
      const siteResult = await client.from("cms_sites")
        .select("id").eq("slug", "portfolio").eq("status", "active")
        .eq("is_public", true).maybeSingle();
      if (siteResult.error || !siteResult.data) return;
      const siteId = siteResult.data.id;

      const pageResult = await client.from("cms_pages")
        .select("id").eq("site_id", siteId).eq("slug", "home")
        .eq("status", "published").maybeSingle();
      if (pageResult.error || !pageResult.data) return;
      const pageId = pageResult.data.id;

      const [sectionResult, contentResult] = await Promise.all([
        client.from("cms_sections").select("id,section_key,title,sort_order")
          .eq("site_id", siteId).eq("page_id", pageId).eq("status", "published")
          .order("sort_order", { ascending: true }),
        client.from("cms_content").select("id,section_id,title,payload,sort_order")
          .eq("site_id", siteId).eq("page_id", pageId).eq("status", "published")
          .order("sort_order", { ascending: true })
      ]);
      if (sectionResult.error) throw sectionResult.error;
      if (contentResult.error) throw contentResult.error;

      const sections = sectionResult.data || [];
      if (!sections.length) return;
      const sectionIds = sections.map(function (row) { return row.id; });
      const mediaResult = await client.from("cms_media")
        .select("id,section_id,storage_path,media_type,title,mime_type,alt_text,sort_order")
        .eq("site_id", siteId).eq("page_id", pageId).eq("status", "published")
        .in("section_id", sectionIds).order("sort_order", { ascending: true });
      if (mediaResult.error) throw mediaResult.error;

      const signedMedia = await Promise.all((mediaResult.data || []).map(async function (row) {
        const result = await client.storage.from("cms-media").createSignedUrl(row.storage_path, 3600);
        return result.error || !result.data ? null : { row: row, url: result.data.signedUrl };
      }));
      const mediaById = new Map(signedMedia.filter(Boolean).map(function (item) {
        return [item.row.id, item];
      }));
      const mediaBySection = new Map();
      mediaById.forEach(function (item) {
        if (!mediaBySection.has(item.row.section_id)) mediaBySection.set(item.row.section_id, []);
        mediaBySection.get(item.row.section_id).push(item);
      });
      const entriesBySection = new Map();
      (contentResult.data || []).forEach(function (entry) {
        if (!entriesBySection.has(entry.section_id)) entriesBySection.set(entry.section_id, []);
        entriesBySection.get(entry.section_id).push(entry);
      });

      function appendMedia(container, item) {
        const row = item.row;
        if (row.media_type === "image") {
          const image = document.createElement("img");
          image.src = item.url;
          image.alt = row.alt_text || row.title || "";
          image.loading = "lazy";
          image.style.maxWidth = "100%";
          image.style.height = "auto";
          container.appendChild(image);
        } else if (row.media_type === "video") {
          const video = document.createElement("video");
          video.src = item.url;
          video.controls = true;
          video.preload = "metadata";
          video.style.maxWidth = "100%";
          container.appendChild(video);
        } else if (row.media_type === "audio") {
          const audio = document.createElement("audio");
          audio.src = item.url;
          audio.controls = true;
          container.appendChild(audio);
        } else {
          const link = document.createElement("a");
          link.href = item.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = row.title || "Open file";
          container.appendChild(link);
        }
      }

      sections.forEach(function (section) {
        // The legacy About Me renderer remains responsible for its original table.
        if (section.section_key === "about") return;
        const targetId = section.section_key.indexOf("topic__") === 0
          ? section.section_key.slice(7) : section.section_key;
        const target = document.getElementById(targetId);
        if (!target) return;

        let mount = target.querySelector(":scope > .cms-published-content");
        if (!mount) {
          mount = document.createElement("div");
          mount.className = "cms-published-content wrap";
          mount.setAttribute("aria-label", "Published website content");
          target.appendChild(mount);
        }

        const attachedIds = new Set();
        (entriesBySection.get(section.id) || []).forEach(function (entry) {
          const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : {};
          if (payload.resource_kind === "folder") return;
          if (payload.resource_kind === "link") {
            const url = typeof payload.url === "string" ? payload.url.trim() : "";
            if (!/^https?:\/\//i.test(url)) return;
            const linkCard = document.createElement("article");
            linkCard.className = "block glow-tab";
            const linkTitle = document.createElement("h3");
            linkTitle.textContent = entry.title || "Related link";
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.textContent = payload.label || url;
            linkCard.appendChild(linkTitle);
            linkCard.appendChild(anchor);
            mount.appendChild(linkCard);
            return;
          }

          const card = document.createElement("article");
          card.className = "block glow-tab";
          const heading = document.createElement("h3");
          heading.textContent = entry.title || section.title || "Content";
          card.appendChild(heading);
          const subtitle = payload.subtitle || payload.category || "";
          if (subtitle) {
            const sub = document.createElement("p");
            sub.className = "muted";
            sub.textContent = String(subtitle);
            card.appendChild(sub);
          }
          const description = payload.description || payload.summary || payload.text || "";
          if (description) {
            const paragraph = document.createElement("p");
            paragraph.className = "muted";
            paragraph.textContent = String(description);
            card.appendChild(paragraph);
          }
          if (Array.isArray(payload.paragraphs)) {
            payload.paragraphs.forEach(function (value) {
              const paragraph = document.createElement("p");
              paragraph.className = "muted";
              paragraph.textContent = String(value);
              card.appendChild(paragraph);
            });
          }
          const mediaWrap = document.createElement("div");
          mediaWrap.className = "cms-published-media";
          (Array.isArray(payload.media_ids) ? payload.media_ids : []).forEach(function (id) {
            const item = mediaById.get(id);
            if (!item || item.row.section_id !== section.id) return;
            attachedIds.add(id);
            appendMedia(mediaWrap, item);
          });
          if (mediaWrap.childNodes.length) card.appendChild(mediaWrap);
          mount.appendChild(card);
        });

        // Files published directly from Section media & resources appear without
        // needing to create a separate content entry or attach them to a card.
        (mediaBySection.get(section.id) || []).forEach(function (item) {
          if (attachedIds.has(item.row.id)) return;
          const card = document.createElement("article");
          card.className = "block glow-tab cms-published-resource";
          const heading = document.createElement("h3");
          heading.textContent = item.row.title || "Published resource";
          card.appendChild(heading);
          const mediaWrap = document.createElement("div");
          mediaWrap.className = "cms-published-media";
          appendMedia(mediaWrap, item);
          card.appendChild(mediaWrap);
          mount.appendChild(card);
        });
      });
    } catch (error) {
      console.warn("Published CMS sections could not be loaded; the original website content remains visible.", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadPublishedLegacySections);
    document.addEventListener("DOMContentLoaded", loadPublishedCmsSections);
  } else {
    loadPublishedLegacySections();
    loadPublishedCmsSections();
  }
})();
