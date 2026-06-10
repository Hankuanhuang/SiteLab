import type { ConceptPlanExport } from "../types/layout";

interface ConceptPlanGalleryProps {
  exports: ConceptPlanExport[];
  isOpen: boolean;
  preview?: ConceptPlanExport;
  onClose: () => void;
  onPreview: (item?: ConceptPlanExport) => void;
  onRename: (item: ConceptPlanExport) => void;
  onDelete: (item: ConceptPlanExport) => void;
}

export function ConceptPlanGallery({
  exports,
  isOpen,
  preview,
  onClose,
  onPreview,
  onRename,
  onDelete,
}: ConceptPlanGalleryProps) {
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
              <button className="secondaryButton compactButton" type="button" onClick={() => onPreview()}>
                Close
              </button>
            </div>
            <div className="conceptPreviewImage">
              <img src={preview.previewDataUrl} alt={`${preview.name} concept site plan`} />
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
