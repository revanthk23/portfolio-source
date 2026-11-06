// Discovers the actual public-page structure so the admin navigation follows website edits.
// This is intentionally read-only: it never changes the public HTML or guesses editable fields.
(function () {
  "use strict";

  function cleanTitle(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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
    if (heading && cleanTitle(heading.textContent)) {
      return cleanTitle(heading.textContent);
    }

    return id.replace(/[-_]+/g, " ").replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    });
  }

  async function syncPortfolioStructure() {
    const response = await fetch("../index.html", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not read the public website structure (" + response.status + ").");
    }

    const source = await response.text();
    const doc = new DOMParser().parseFromString(source, "text/html");
    const validId = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
    const mainSections = Array.from(doc.querySelectorAll("section[id]"))
      .filter(function (node) {
        return validId.test(node.id) && !node.closest(".topic");
      })
      .map(function (node) {
        return { key: node.id, title: titleFor(node, doc) };
      });

    const subsections = Array.from(doc.querySelectorAll(".topic[id], [data-cms-subsection][id]"))
      .filter(function (node) { return validId.test(node.id); })
      .map(function (node) {
        const parent = node.closest("section[id]");
        return {
          key: "topic__" + node.id,
          title: titleFor(node, doc),
          parentKey: parent && parent !== node ? parent.id : null
        };
      });

    if (typeof window.__portfolioSetSiteSections === "function") {
      window.__portfolioSetSiteSections(mainSections, subsections);
    }

    window.dispatchEvent(new CustomEvent("portfolio:structure-synced", {
      detail: { mainSections: mainSections.length, subsections: subsections.length }
    }));
    return { mainSections: mainSections.length, subsections: subsections.length };
  }

  window.syncPortfolioStructure = syncPortfolioStructure;
})();
