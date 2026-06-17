import { useEffect, useState } from "react";
import { conceptRenderName } from "../services/aiConceptRender";
import type {
  ConceptPlanExport,
  ConceptPlanRenderedVersion,
} from "../types/layout";

interface ConceptPlanGalleryProps {
  exports: ConceptPlanExport[];
  isOpen: boolean;
  preview?: ConceptPlanExport;
  onClose: () => void;
  onPreview: (item?: ConceptPlanExport) => void;
  onRename: (item: ConceptPlanExport) => void;
  onDelete: (item: ConceptPlanExport) => void;
  onRender: (item: ConceptPlanExport) => Promise<ConceptPlanRenderedVersion>;
}

export function ConceptPlanGallery({
  exports,
  isOpen,
  preview,
  onClose,
  onPreview,
  onRename,
  onDelete,
  onRender,
}: ConceptPlanGalleryProps) {
  const [selectedRenderId, setSelectedRenderId] = useState<string>();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    setSelectedRenderId(preview?.renderedVersions?.[0]?.id);
    setSelectedImageIndex(0);
    setRenderError("");
  }, [preview?.id, preview?.renderedVersions]);

  const selectedRender = preview?.renderedVersions?.find(
    (item) => item.id === selectedRenderId,
  );
  const previewImages = preview?.images?.length
    ? preview.images
    : preview
      ? [{
          id: "focused",
          name: "Focused Site Image",
          previewDataUrl: preview.previewDataUrl,
          thumbnailDataUrl: preview.thumbnailDataUrl,
        }]
      : [];
  const selectedImage = previewImages[Math.min(selectedImageIndex, Math.max(0, previewImages.length - 1))];

  const renderPreview = async () => {
    if (!preview || isRendering) return;
    setIsRendering(true);
    setRenderError("");
    try {
      const rendered = await onRender(preview);
      setSelectedRenderId(rendered.id);
    } catch (error) {
      setRenderError(
        error instanceof Error ? error.message : "Unable to render the concept plan.",
      );
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <>
      {isOpen ? (
        <aside className="conceptGallery" aria-label="Concept Plan Gallery">
          <div className="conceptGalleryHeader">
            <div>
              <p className="eyebrow">Design history</p>
              <h2>Concept Plan Gallery</h2>
              <p>{exports.length} saved {exports.length === 1 ? "export" : "exports"}</p>
            </div>
            <button className="secondaryButton compactButton" type="button" onClick={onClose}>
              Close
            </button>
          </div>
          {exports.length ? (
            <div className="conceptGalleryGrid">
              {exports.map((item) => (
                <article className="conceptGalleryCard" key={item.id}>
                  <button
                    className="conceptGalleryThumbnail"
                    type="button"
                    onClick={() => onPreview(item)}
                    aria-label={`Preview ${item.name}`}
                  >
                    <img src={item.thumbnailDataUrl} alt="" />
                  </button>
                  <div className="conceptGalleryCardBody">
                    <strong>{item.name}</strong>
                    <span>{item.layoutName} - Export {item.exportNumber}</span>
                    <time dateTime={item.exportedAt}>{formatExportDate(item.exportedAt)}</time>
                    {item.renderedVersions?.length ? (
                      <span>{item.renderedVersions.length} AI rendered</span>
                    ) : null}
                  </div>
                  <div className="conceptGalleryActions">
                    <button className="secondaryButton compactButton" type="button" onClick={() => onPreview(item)}>
                      Preview
                    </button>
                    <button className="secondaryButton compactButton" type="button" onClick={() => onRename(item)}>
                      Rename
                    </button>
                    <button className="dangerButton compactButton" type="button" onClick={() => onDelete(item)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="conceptGalleryEmpty">
              <strong>No concept plans yet</strong>
              <p>Export a concept site plan to begin this project&apos;s design history.</p>
            </div>
          )}
        </aside>
      ) : null}
      {preview ? (
        <div className="modalBackdrop conceptPreviewBackdrop" role="presentation" onMouseDown={() => onPreview()}>
          <section
            className="conceptPreviewDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="concept-preview-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="conceptPreviewHeader">
              <div>
                <h2 id="concept-preview-title">{preview.name}</h2>
                <p>{preview.layoutName} - Export {preview.exportNumber} - {formatExportDate(preview.exportedAt)}</p>
              </div>
              <div className="conceptPreviewActions">
                <button type="button" disabled={isRendering} onClick={renderPreview}>
                  {isRendering ? "Rendering..." : "Render"}
                </button>
                <button className="secondaryButton compactButton" type="button" onClick={() => onPreview()}>
                  Close
                </button>
              </div>
            </div>
            {renderError ? <p className="conceptRenderError">{renderError}</p> : null}
            {previewImages.length > 1 ? (
              <div className="conceptImageNavigator" aria-label="Export image navigation">
                <button
                  className="secondaryButton compactButton"
                  type="button"
                  onClick={() => setSelectedImageIndex((current) => (current + previewImages.length - 1) % previewImages.length)}
                  aria-label="Previous export image"
                >
                  ←
                </button>
                <span>{selectedImage?.name}</span>
                <button
                  className="secondaryButton compactButton"
                  type="button"
                  onClick={() => setSelectedImageIndex((current) => (current + 1) % previewImages.length)}
                  aria-label="Next export image"
                >
                  →
                </button>
              </div>
            ) : null}
            {preview.renderedVersions?.length ? (
              <div className="conceptRenderPicker">
                <button
                  className={!selectedRender ? "active" : ""}
                  type="button"
                  onClick={() => setSelectedRenderId(undefined)}
                >
                  Original only
                </button>
                {preview.renderedVersions.map((item, index) => (
                  <button
                    className={selectedRenderId === item.id ? "active" : ""}
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedRenderId(item.id)}
                  >
                    {conceptRenderName} {preview.renderedVersions!.length - index}
                  </button>
                ))}
              </div>
            ) : null}
            <div className={`conceptPreviewImage ${selectedRender ? "comparison" : ""}`}>
              <figure>
                <figcaption>{selectedImage?.name ?? "Original Export"}</figcaption>
                <img src={selectedImage?.previewDataUrl ?? preview.previewDataUrl} alt={`${preview.name} original concept site plan`} />
              </figure>
              {selectedRender ? (
                <figure>
                  <figcaption>
                    Rendered Version - {conceptRenderName}
                  </figcaption>
                  <img src={selectedRender.previewDataUrl} alt={`${preview.name} AI rendered concept site plan`} />
                </figure>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function formatExportDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
