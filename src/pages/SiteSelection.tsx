import { defaultSiteData } from "../models/Site";
import { startNewActiveProject } from "../services/conceptPlanGalleryStorage";
import { DEFAULT_PROJECT_NAME } from "../services/projectName";

export function SiteSelection() {
  const openEditor = () => {
    startNewActiveProject(DEFAULT_PROJECT_NAME);
    sessionStorage.setItem("siteData", JSON.stringify(defaultSiteData));
    sessionStorage.removeItem("siteBackgroundImage");
    sessionStorage.removeItem("siteFullPageImage");
    sessionStorage.removeItem("siteBackgroundMeta");
    window.history.pushState(null, "", "/site-editor");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.location.assign("/site-editor");
  };

  const openPdfSetup = () => {
    window.location.assign("/site-setup");
  };

  return (
    <main className="selectionPage">
      <section className="introPanel">
        <p className="eyebrow">Site selection</p>
        <h1>Site Boundary Selector</h1>
        <p>
          Upload a site plan PDF, choose the plan page, mark the site boundary area, and enter the real site size
          before building the layout.
        </p>
        <div className="introActions">
          <button type="button" onClick={openPdfSetup}>
            Upload PDF
          </button>
          <button className="secondaryButton" type="button" onClick={openEditor}>
            Use Sample Site
          </button>
        </div>
      </section>
    </main>
  );
}
