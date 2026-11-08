// Discovers the actual public-page structure so the admin navigation follows website edits.
(function () {
  "use strict";

  function cleanTitle(value) {
    return String(value || "").replace(/\\s+/g, " ").trim();
  }

  function titleFor(node, doc) {
    const id = node.id;
    const links = Array.from(doc.querySelectorAll("a[href]"));
    const matchingLink = links.find(function (link) {
      return link.getAttribute("href") === "#" + id;
    });
    if (matchingLink && cleanTitle(matchingLink.textContent)) {
      return cleanTitle(matchingLink.textContent);
    }
    const heading = node.querySelector("h1, h2, h3, h4");
    if (heading && cleanTitle(heading.textContent)) return cleanTitle(heading.textContent);
    return id.replace(/[-_]+/g, " ").replace(/\\b\\w/g, function (letter) {
      return letter.toUpperCase();
    });
  }

  function parseStructure(source) {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const validId = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
    // Exclude topic panels themselves, not every element that happens to be
    // nested inside one. Some portfolio layouts place real sections inside wrappers.
    const mainSections = Array.from(doc.querySelectorAll("section[id]"))
      .filter(function (node) {
        return validId.test(node.id) && !node.classList.contains("topic");
      })
      .map(function (node) {
        return { key: node.id, title: titleFor(node, doc) };
      });
    const subsections = Array.from(doc.querySelectorAll(".topic[id], [data-cms-subsection][id]"))
      .filter(function (node) { return validId.test(node.id); })
      .map(function (node) {
        const opener = Array.from(doc.querySelectorAll("[data-topic]")).find(function (link) {
          return link.getAttribute("data-topic") === node.id;
        });
        const parent = opener ? opener.closest("section[id]:not(.topic)") : null;
        return {
          key: "topic__" + node.id,
          title: titleFor(node, doc),
          parentKey: parent ? parent.id : null
        };
      });
    return { mainSections: mainSections, subsections: subsections, title: doc.title || "" };
  }

  async function syncPortfolioStructure() {
    // Cloudflare/Netlify projects may be deployed with either the portfolio
    // folder as the site root or the repository root. Try both valid layouts.
    const candidates = [
      new URL("../index.html", window.location.href).href,
      new URL("/index.html", window.location.origin).href,
      new URL("/portf/index.html", window.location.origin).href
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
