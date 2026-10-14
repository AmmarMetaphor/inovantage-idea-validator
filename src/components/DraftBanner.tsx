import { Notice } from './Notice';

/** Banner for legal pages that have not been reviewed by the owner or a lawyer. */
export function DraftBanner({ page }: { page: string }) {
  return (
    <Notice tone="warning" title={`Draft ${page} — for owner review`} role="note">
      <p>
        This page is a working draft written to show structure and intent. It has not been reviewed
        by the business owner or a legal adviser, and it is not yet in force. Do not rely on it.
      </p>
    </Notice>
  );
}
