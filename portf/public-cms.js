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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadPublishedAbout);
  } else {
    loadPublishedAbout();
  }
})();
