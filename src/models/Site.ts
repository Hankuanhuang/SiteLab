import type { SiteData, SiteDimensions } from "../types/layout";

export const defaultSiteData: SiteData = {
  site_page_index: 2,
  site_shape: "rectangle",
  geometry: {
    x1: 435.683,
    y1: 701.294,
    x2: 858.544,
    y2: 1377.277,
  },
  scale: {
    pixels_per_meter: 10.447,
    length_m: 72,
    width_m: 45,
  },
};

export function siteDataToDimensions(siteData: SiteData): SiteDimensions {
  return {
    length: siteData.scale.length_m,
    width: siteData.scale.width_m,
    pixelsPerMeter: siteData.scale.pixels_per_meter,
  };
}
