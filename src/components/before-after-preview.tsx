import { DocumentViewer } from "@/components/document-viewer";

interface BeforeAfterPreviewProps {
  originalUrl: string | null;
  originalMime: string;
  processedUrl: string | null;
  processedMime: string | null;
  fileName: string;
}

export function BeforeAfterPreview({
  originalUrl,
  originalMime,
  processedUrl,
  processedMime,
  fileName,
}: BeforeAfterPreviewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Original</p>
        <DocumentViewer url={originalUrl} mime={originalMime} fileName={fileName} />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Processed</p>
        <DocumentViewer
          url={processedUrl ?? originalUrl}
          mime={processedMime ?? originalMime}
          fileName={fileName}
          emptyLabel="No processed copy yet"
        />
      </div>
    </div>
  );
}
