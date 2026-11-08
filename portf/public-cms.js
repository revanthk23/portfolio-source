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


  // Render only explicitly published multi-site CMS entries. Drafts remain private.
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

      const sectionsById = new Map((sectionResult.data || []).map(function (row) {
        return [row.id, row];
      }));
      const entries = contentResult.data || [];
      const mediaIds = Array.from(new Set(entries.reduce(function (all, row) {
        const ids = row.payload && Array.isArray(row.payload.media_ids) ? row.payload.media_ids : [];
        return all.concat(ids.filter(function (id) { return typeof id === "string"; }));
      }, [])));

      let mediaById = new Map();
      if (mediaIds.length) {
        const mediaResult = await client.from("cms_media")
          .select("id,storage_path,media_type,title,mime_type,alt_text")
          .eq("site_id", siteId).eq("status", "published").in("id", mediaIds);
        if (mediaResult.error) throw mediaResult.error;
        const signed = await Promise.all((mediaResult.data || []).map(async function (row) {
          const result = await client.storage.from("cms-media").createSignedUrl(row.storage_path, 3600);
          return result.error ? null : { row: row, url: result.data.signedUrl };
        }));
        mediaById = new Map(signed.filter(Boolean).map(function (item) {
          return [item.row.id, item];
        }));
      }

      const entriesBySection = new Map();
      entries.forEach(function (entry) {
        if (!entriesBySection.has(entry.section_id)) entriesBySection.set(entry.section_id, []);
        entriesBySection.get(entry.section_id).push(entry);
      });

      sectionsById.forEach(function (section) {
        // The legacy About Me renderer remains responsible for its original table.
        if (section.section_key === "about") return;
        const targetId = section.section_key.indexOf("topic__") === 0
          ? section.section_key.slice(7) : section.section_key;
        const target = document.getElementById(targetId);
        const sectionEntries = entriesBySection.get(section.id) || [];
        if (!target || !sectionEntries.length) return;

        let mount = target.querySelector(":scope > .cms-published-content");
        if (!mount) {
          mount = document.createElement("div");
          mount.className = "cms-published-content wrap";
          mount.setAttribute("aria-label", "Published website content");
          target.appendChild(mount);
        }

        sectionEntries.forEach(function (entry) {
          const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : {};
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
          const ids = Array.isArray(payload.media_ids) ? payload.media_ids : [];
          ids.forEach(function (id) {
            const item = mediaById.get(id);
            if (!item) return;
            const row = item.row;
            if (row.media_type === "image") {
              const image = document.createElement("img");
              image.src = item.url;
              image.alt = row.alt_text || row.title || "";
              image.loading = "lazy";
              image.style.maxWidth = "100%";
              image.style.height = "auto";
              mediaWrap.appendChild(image);
            } else if (row.media_type === "video") {
              const video = document.createElement("video");
              video.src = item.url;
              video.controls = true;
              video.preload = "metadata";
              video.style.maxWidth = "100%";
              mediaWrap.appendChild(video);
            } else {
              const link = document.createElement("a");
              link.href = item.url;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = row.title || "Open file";
              mediaWrap.appendChild(link);
            }
          });
          if (mediaWrap.childNodes.length) card.appendChild(mediaWrap);
          mount.appendChild(card);
        });
      });
    } catch (error) {
      console.warn("Published CMS sections could not be loaded; the original website content remains visible.", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadPublishedAbout);
    document.addEventListener("DOMContentLoaded", loadPublishedCmsSections);
  } else {
    loadPublishedAbout();
    loadPublishedCmsSections();
  }
})();
