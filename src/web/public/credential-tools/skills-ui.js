(() => {
  "use strict";
  const node = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  async function request(path, body) {
    const r = await fetch(
      (path.startsWith("onet/") ||
      document.querySelector("[data-public-skills]")
        ? "/api/badges/public/skills/"
        : "/api/badges/admin/skills/") + path,
      {
        credentials: "same-origin",
        method: body === undefined ? "GET" : "POST",
        headers:
          body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    const data = await r.json();
    if (!r.ok)
      throw new Error(
        data.error || data.message || "Skills information is unavailable.",
      );
    return data;
  }
  function addOutlook(parent, code) {
    const button = node("button", "View O*NET outlook"),
      status = node("p", undefined, "skills-note"),
      details = node("div");
    button.type = "button";
    button.setAttribute("aria-label", "View O*NET outlook for " + code);
    status.setAttribute("role", "status");
    parent.append(button, status, details);
    button.addEventListener("click", async () => {
      button.disabled = true;
      status.textContent = "Retrieving O*NET information…";
      try {
        const data = await request("onet/outlook", { code });
        details.replaceChildren(
          node("h5", "O*NET national outlook: " + data.outlook.category),
          node("p", data.outlook.description),
        );
        for (const item of data.brightOutlook)
          details.append(node("p", item.title));
        const source = node("a", "O*NET Web Services");
        source.href = data.attributionUrl;
        source.target = "_blank";
        source.rel = "noopener noreferrer";
        const report = node("a", "Full career report");
        report.href = data.url;
        report.target = "_blank";
        report.rel = "noopener noreferrer";
        details.append(
          source,
          " · ",
          report,
          node(
            "p",
            "United States information · retrieved " +
              new Date(data.retrievedAt).toLocaleString() +
              ". Retrieval time is not the source publication date.",
            "skills-note",
          ),
        );
        status.textContent = "O*NET outlook loaded.";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }
  function createOnetSearch(parent) {
    const section = node("section", undefined, "skills-onet-search");
    section.innerHTML =
      '<h3>Search occupations with O*NET</h3><p>Search career titles using the O*NET API, then view national job outlook information. These reference results do not award a skill or credential.</p><form><label for="onet-occupation-query">Occupation keywords</label><div class="skills-search-controls"><input id="onet-occupation-query" type="search" maxlength="100" placeholder="For example: instructional designer"><button type="submit" disabled>Search occupations</button></div></form><p class="onet-status" role="status"></p><div class="onet-results"></div>';
    parent.append(section);
    const form = section.querySelector("form"),
      input = section.querySelector("input"),
      button = section.querySelector("button"),
      status = section.querySelector(".onet-status"),
      results = section.querySelector(".onet-results");
    input.disabled = true;
    request("onet/status")
      .then((data) => {
        status.textContent = data.message;
        button.disabled = input.disabled = !data.configured;
      })
      .catch((error) => {
        status.textContent = error.message;
      });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      if (input.value.trim().length < 2) {
        status.textContent = "Enter at least two characters.";
        return;
      }
      button.disabled = true;
      status.textContent = "Searching O*NET occupations…";
      try {
        const data = await request("onet/search", { query: input.value });
        results.replaceChildren();
        for (const occupation of data.occupations) {
          const card = node("article", undefined, "skills-occupation"),
            title = node("h4"),
            link = node("a", occupation.title);
          link.href = occupation.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          title.append(link);
          card.append(title, node("p", "O*NET " + occupation.code));
          addOutlook(card, occupation.code);
          results.append(card);
        }
        status.textContent =
          data.occupations.length +
          " occupation results" +
          (data.occupations.length === data.limit
            ? " (first " + data.limit + ")"
            : "") +
          ".";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
    const credit = webServicesCredit(section);
    section.insertBefore(credit, results);
  }
  function webServicesCredit(container) {
    const credit = node("div", undefined, "skills-onet-credit"),
      logoLine = node("p", undefined, "skills-onet-logo"),
      logoLink = node("a"),
      image = node("img");
    logoLink.href = "https://services.onetcenter.org/";
    logoLink.title =
      "This site incorporates information from O*NET Web Services. Click to learn more.";
    logoLink.target = "_blank";
    logoLink.rel = "noopener noreferrer";
    image.src = "/credential-tools/onet-in-it.svg";
    image.alt = "O*NET in-it";
    image.width = 130;
    image.height = 60;
    logoLink.append(image);
    logoLine.append(logoLink);
    const text = node("p", undefined, "skills-note"),
      source = node("a", "O*NET Web Services");
    source.href = "https://services.onetcenter.org/";
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    text.append(
      "This site incorporates information from ",
      source,
      " by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). O*NET® is a trademark of USDOL/ETA.",
    );
    credit.append(logoLine, text);
    container.append(credit);
    return credit;
  }
  function attribution(container, catalog) {
    const p = node(
      "p",
      catalog.attribution || "No O*NET release has been imported.",
      "skills-note",
    );
    if (catalog.skillsRelease) {
      const source = node(
        "a",
        "O*NET " + catalog.skillsRelease.version + " Database",
      );
      source.href = "https://www.onetcenter.org/database.html";
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      const license = node("a", "CC BY 4.0");
      license.href = "https://creativecommons.org/licenses/by/4.0/";
      license.target = "_blank";
      license.rel = "noopener noreferrer";
      p.append(" ", source, " · ", license);
    }
    container.append(p);
    webServicesCredit(container);
  }
  function createPicker(parent, onChange, options = {}) {
    const assess = options.assess !== false,
      section = node("section", undefined, "skills-picker");
    section.innerHTML =
      "<h3>" +
      (assess ? "Assessed skills" : "Explore skills and careers") +
      "</h3><p>" +
      (assess
        ? "Select the skills this badge actually assesses, then explain the assessment for each one. Saved and issued versions retain these source definitions."
        : "Search official O*NET skills and select up to 20 to explore related occupations. This reference search does not add skills to an issued credential.") +
      '</p><label for="skills-query">Search O*NET skills or software</label><div class="skills-search-controls"><input id="skills-query" type="search" maxlength="100" placeholder="For example: critical thinking or Microsoft Excel"><button id="skills-search" type="button">Search skills</button></div><p class="skills-status" role="status"></p><div class="skills-results"></div><h4>Selected skills</h4><div class="skills-selected"></div>';
    parent.append(section);
    const query = section.querySelector("#skills-query"),
      search = section.querySelector("#skills-search"),
      status = section.querySelector(".skills-status"),
      results = section.querySelector(".skills-results"),
      chosen = section.querySelector(".skills-selected");
    let selected = [],
      catalog = null,
      busy = false;
    const changed = () => {
      onChange?.();
      section.dispatchEvent(new Event("input", { bubbles: true }));
    };
    function showSelected() {
      chosen.replaceChildren();
      if (!selected.length)
        chosen.append(node("p", "No skills selected.", "skills-note"));
      for (const skill of selected) {
        const item = node("div", undefined, "skills-selection");
        item.append(
          node("strong", skill.name),
          node("p", skill.description),
          node("small", "O*NET " + skill.version + " · " + skill.category),
        );
        if (assess) {
          const label = node("label", "How is " + skill.name + " assessed?"),
            text = node("textarea");
          text.id =
            "skill-assessment-" + skill.id.replace(/[^a-zA-Z0-9]/g, "-");
          label.htmlFor = text.id;
          text.rows = 3;
          text.maxLength = 1000;
          text.value = skill.assessment || "";
          text.setAttribute("aria-describedby", "skills-assessment-help");
          text.addEventListener("input", () => {
            skill.assessment = text.value;
            onChange?.();
          });
          item.append(label, text);
        }
        const remove = node("button", "Remove " + skill.name);
        remove.type = "button";
        remove.addEventListener("click", () => {
          selected = selected.filter(
            (s) => !(s.id === skill.id && s.releaseId === skill.releaseId),
          );
          showSelected();
          changed();
          search.focus();
        });
        item.append(remove);
        chosen.append(item);
      }
    }
    if (assess) {
      const help = node(
        "p",
        "Use 10–1,000 characters to identify the assessment, performance standard, or documented evidence for each skill.",
        "skills-note",
      );
      help.id = "skills-assessment-help";
      section.append(help);
    }
    async function find() {
      if (busy) return;
      if (query.value.trim().length < 2) {
        status.textContent = "Enter at least two characters.";
        return;
      }
      busy = true;
      search.disabled = true;
      status.textContent = "Searching the imported O*NET catalog…";
      try {
        const data = await request("search", { query: query.value });
        results.replaceChildren();
        for (const skill of data.skills) {
          const item = node("article", undefined, "skills-result");
          item.append(
            node("h4", skill.name),
            node("p", skill.description),
            node("small", "O*NET " + skill.version + " · " + skill.category),
          );
          const add = node("button", "Select " + skill.name);
          add.type = "button";
          add.disabled =
            selected.some(
              (s) => s.id === skill.id && s.releaseId === skill.releaseId,
            ) || selected.length >= 20;
          add.addEventListener("click", () => {
            if (selected.length >= 20) return;
            selected.push({ ...skill, ...(assess ? { assessment: "" } : {}) });
            showSelected();
            add.disabled = true;
            changed();
            status.textContent = skill.name + " selected.";
          });
          item.append(add);
          results.append(item);
        }
        status.textContent =
          data.skills.length +
          " skill results" +
          (data.skills.length === data.limit
            ? " (first " + data.limit + ")"
            : "") +
          ".";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy = false;
        search.disabled = false;
      }
    }
    search.addEventListener("click", find);
    query.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        find();
      }
    });
    search.disabled = true;
    request("catalog")
      .then((data) => {
        catalog = data;
        search.disabled = !data.ready;
        query.disabled = !data.ready;
        if (!data.ready)
          status.textContent =
            "Skills reference data is not available yet. Please contact portal support.";
        attribution(section, data);
      })
      .catch((error) => {
        status.textContent = error.message;
      });
    showSelected();
    return {
      get: () => structuredClone(selected),
      set: (value) => {
        selected = structuredClone(value);
        results.replaceChildren();
        showSelected();
      },
      valid: () => {
        const valid =
          !assess || selected.every((s) => s.assessment?.trim().length >= 10);
        if (!valid)
          status.textContent =
            "Explain how each selected skill is assessed (at least 10 characters).";
        return valid;
      },
      catalog: () => catalog,
    };
  }
  function renderCareers(container, data, onRegion) {
    const previousRegion = container.querySelector(".skills-region");
    const hadRegionFocus =
      previousRegion === document.activeElement ||
      (previousRegion?.dataset.restoreFocus === "true" &&
        document.activeElement === document.body);
    container.replaceChildren();
    container.append(
      node("h3", "Related occupations and labor-market information"),
    );
    const label = node("label", "Wage region"),
      select = node("select");
    select.className = "skills-region";
    select.id = "skills-region-" + Math.random().toString(36).slice(2);
    label.htmlFor = select.id;
    select.replaceChildren(
      ...(data.regions || []).map((r) => new Option(r.name, r.id)),
    );
    select.value = data.region;
    select.disabled = !data.regions?.length;
    select.addEventListener("change", async () => {
      select.dataset.restoreFocus = String(document.activeElement === select);
      select.disabled = true;
      try {
        await onRegion(select.value);
      } finally {
        if (select.isConnected) {
          select.disabled = false;
          if (
            select.dataset.restoreFocus === "true" &&
            document.activeElement === document.body
          )
            select.focus();
        }
      }
    });
    container.append(label, select);
    if (data.alignments?.length) {
      const details = node("details"),
        summary = node("summary", "How these skills were assessed");
      details.append(summary);
      for (const skill of data.alignments)
        details.append(node("h4", skill.name), node("p", skill.assessment));
      container.append(details);
    }
    container.append(node("p", data.note || "", "skills-note"));
    if (!data.occupations.length)
      container.append(
        node(
          "p",
          "No related occupations match these recorded skills in the imported reference data.",
        ),
      );
    const money = (value, hourly = false) =>
      value === null
        ? "Not published"
        : new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: hourly ? 2 : 0,
          }).format(value);
    const c = data.catalog || {};
    attribution(container, c);
    for (const occupation of data.occupations) {
      const card = node("article", undefined, "skills-occupation"),
        title = node("h4"),
        link = node("a", occupation.title);
      link.href = occupation.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      title.append(link);
      card.append(
        title,
        node(
          "p",
          "O*NET " + occupation.code + " · SOC " + occupation.socCode,
          "skills-note",
        ),
      );
      const matches = node("ul");
      for (const match of occupation.matches)
        matches.append(
          node(
            "li",
            match.name +
              (match.basis === "software_example"
                ? " — listed software example"
                : " — importance " +
                  Number(match.importance).toFixed(2) +
                  "/5" +
                  (match.dataDate
                    ? " (source rating " + match.dataDate + ")"
                    : "")),
          ),
        );
      card.append(matches);
      if (occupation.wage) {
        const w = occupation.wage;
        card.append(
          node("p", w.regionName + " · BLS OEWS " + w.year),
          node(
            "p",
            "Median annual wage: " +
              money(w.medianAnnual) +
              (w.medianAnnual === null && w.annualMarker
                ? " (source marker " + w.annualMarker + ")"
                : ""),
          ),
          node(
            "p",
            "Median hourly wage: " +
              money(w.medianHourly, true) +
              (w.medianHourly === null && w.hourlyMarker
                ? " (source marker " + w.hourlyMarker + ")"
                : ""),
          ),
        );
      } else
        card.append(
          node(
            "p",
            "No published wage estimate for this occupation and selected region.",
          ),
        );
      if (occupation.outlook) {
        const o = occupation.outlook;
        card.append(
          node(
            "p",
            "United States outlook · " +
              o.baseYear +
              "–" +
              o.endYear +
              " (national)",
          ),
          node(
            "p",
            "Projected employment change: " +
              (o.percentChange === null
                ? "Not published"
                : o.percentChange + "%"),
          ),
          node(
            "p",
            "Annual openings, period average: " +
              (o.annualOpenings === null
                ? "Not published"
                : o.annualOpenings.toLocaleString("en-US") + " jobs per year"),
          ),
        );
      } else
        card.append(
          node("p", "No published national projection for this occupation."),
        );
      card.append(node("p", occupation.scopeNote, "skills-note"));
      if (data.catalog?.onet?.configured) addOutlook(card, occupation.code);
      container.append(card);
    }
    if (c.marketRelease) {
      const p = node(
        "p",
        "Statistics: " +
          c.marketRelease.version +
          " · imported " +
          new Date(c.marketRelease.importedAt).toLocaleDateString() +
          ". ",
        "skills-note",
      );
      for (const [name, url] of [
        ["BLS wages", "https://www.bls.gov/oes/tables.htm"],
        [
          "BLS projections",
          "https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.Htm",
        ],
      ]) {
        const a = node("a", name);
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        p.append(a, " ");
      }
      container.append(p);
    }
    if (hadRegionFocus) select.focus();
  }
  window.CUSkills = { createPicker, renderCareers, request, createOnetSearch };
})();
