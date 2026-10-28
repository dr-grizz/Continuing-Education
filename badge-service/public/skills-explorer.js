import "/skills-ui.js";
const root = document.querySelector(
  ".cu-certificates,.cu-awards[data-api],[data-public-skills]",
);
if (root) {
  const tools = root.matches("[data-public-skills]")
    ? root
    : root.querySelector("#cc-tools,#ca-tools");
  if (tools) {
    const section = document.createElement("section");
    section.className = "ca-card skills-explorer";
    section.innerHTML =
      '<h2>Skills and career connections</h2><p>Explore the occupational relevance of skills and view occupation statistics for your selected wage region. Staff can add assessed skills through the badge designer.</p><div class="skills-picker-host"></div><button type="button" class="skills-explore-button" disabled>Find related occupations</button><p class="skills-explorer-status" role="status"></p><div class="skills-careers" aria-live="polite"></div>';
    tools.append(section);
    window.CUSkills.createOnetSearch(section);
    const button = section.querySelector(".skills-explore-button"),
      status = section.querySelector(".skills-explorer-status"),
      results = section.querySelector(".skills-careers");
    let busy = false;
    const picker = window.CUSkills.createPicker(
      section.querySelector(".skills-picker-host"),
      () => {
        button.disabled = busy || !picker.get().length;
      },
      { assess: false },
    );
    async function show(region = "US") {
      if (busy) return;
      busy = true;
      button.disabled = true;
      status.textContent = "Loading occupation statistics…";
      try {
        const data = await window.CUSkills.request("occupations", {
          skills: picker
            .get()
            .map((s) => ({ id: s.id, releaseId: s.releaseId })),
          region,
        });
        window.CUSkills.renderCareers(results, data, show);
        status.textContent =
          data.occupations.length + " related occupations shown.";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy = false;
        button.disabled = !picker.get().length;
      }
    }
    button.addEventListener("click", () => show());
  }
}
