// Discovers the actual public-page structure so the admin navigation follows website edits.
(function () {
  "use strict";

  function cleanTitle(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function titleFor(node, doc) {
    const heading = node.querySelector("h1, h2, h3, h4");
    if (heading && cleanTitle(heading.textContent)) return cleanTitle(heading.textContent);

    const id = node.id;
    const matchingLink = Array.from(doc.querySelectorAll("a[href]")).find(function (link) {
      return link.getAttribute("href") === "#" + id &&
        cleanTitle(link.textContent);
    });
    if (matchingLink) return cleanTitle(matchingLink.textContent);
    return id.replace(/[-_]+/g, " ").replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    });
  }

  function parseStructure(source) {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const validId = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
    const mainNodes = Array.from(doc.querySelectorAll("section[id]"))
      .filter(function (node) {
        return validId.test(node.id) &&
          !node.classList.contains("topic") &&
          !node.closest(".topic");
      });

    const mainIds = new Set(mainNodes.map(function (node) { return node.id; }));
    const topicTargetIds = new Set(Array.from(doc.querySelectorAll("[data-topic]"))
      .map(function (link) { return String(link.getAttribute("data-topic") || "").trim(); })
      .filter(Boolean));

    const subsectionNodes = Array.from(doc.querySelectorAll("[id]")).filter(function (node) {
      return validId.test(node.id) && !mainIds.has(node.id) &&
        (topicTargetIds.has(node.id) || node.matches(".topic[id], [data-cms-subsection][id]"));
    });

    const mainSections = mainNodes.map(function (node) {
      return { key: node.id, title: titleFor(node, doc) };
    });

    const subsections = subsectionNodes.map(function (node) {
      // Ignore links inside the destination itself (often cards linking back
      // to their own modal). The first external opener defines its real parent.
      const opener = Array.from(doc.querySelectorAll("[data-topic]")).find(function (link) {
        return String(link.getAttribute("data-topic") || "").trim() === node.id &&
          !node.contains(link);
      });
      const parentTopic = (opener && opener.closest(".topic[id]")) ||
        (node.parentElement && node.parentElement.closest(".topic[id]"));
      const parentMain = (opener && opener.closest("section[id]:not(.topic)")) ||
        (node.parentElement && node.parentElement.closest("section[id]:not(.topic)"));
      const parentKey = parentTopic && parentTopic.id !== node.id
        ? "topic__" + parentTopic.id
        : parentMain && parentMain.id !== node.id ? parentMain.id : null;

      return {
        key: "topic__" + node.id,
        title: titleFor(node, doc),
        parentKey: parentKey
      };
    });
    return { mainSections: mainSections, subsections: subsections, title: doc.title || "" };
  }

  async function syncPortfolioStructure() {
    // Cloudflare/Netlify projects may be deployed with either the portfolio
    // folder as the site root or the repository root. Try both valid layouts.
    const candidates = [
      // Prefer the HTML shipped with this exact admin deployment so the
      // dashboard cannot silently mirror an older Netlify production copy.
      new URL("../index.html", window.location.href).href,
      new URL("/index.html", window.location.origin).href,
      new URL("/portf/index.html", window.location.origin).href,
      "https://revanthportf.netlify.app/?cms-structure=1"
    ].filter(function (url, index, all) { return all.indexOf(url) === index; });
    const diagnostics = [];
    let structure = null;

    for (const url of candidates) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          diagnostics.push(url + " returned HTTP " + response.status);
          continue;
        }
        const source = await response.text();
        const parsed = parseStructure(source);
        diagnostics.push(url + " — " + parsed.mainSections.length + " main sections" +
          (parsed.title ? ' ("' + parsed.title + '")' : ""));
        if (parsed.mainSections.length) {
          structure = parsed;
          break;
        }
      } catch (error) {
        diagnostics.push(url + " — " + (error.message || "request failed"));
      }
    }

    if (!structure) {
      throw new Error("No main website sections were found in the deployed portfolio HTML. Checked: " +
        diagnostics.join("; "));
    }

    if (typeof window.__portfolioSetSiteSections === "function") {
      window.__portfolioSetSiteSections(structure.mainSections, structure.subsections);
    }
    window.dispatchEvent(new CustomEvent("portfolio:structure-synced", {
      detail: {
        mainSections: structure.mainSections.length,
        subsections: structure.subsections.length
      }
    }));
    return {
      mainSections: structure.mainSections.length,
      subsections: structure.subsections.length
    };
  }

  window.syncPortfolioStructure = syncPortfolioStructure;
})();
