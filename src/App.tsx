import { SiteEditor } from "./pages/SiteEditor";
import { PdfSiteSetup } from "./pages/PdfSiteSetup";
import { SiteSelection } from "./pages/SiteSelection";

export function App() {
  const path = window.location.pathname;

  if (path === "/site-setup") {
    return <PdfSiteSetup />;
  }

  if (path === "/site-editor") {
    return <SiteEditor />;
  }

  return <SiteSelection />;
}
