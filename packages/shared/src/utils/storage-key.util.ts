import path from 'path';

/**
 * Sanitizes a filename by removing dangerous characters.
 * Preserves alphanumeric, dots, hyphens, underscores.
 */
export function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename, ext)
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);
  return `${base}${ext}`;
}

/**
 * Generates a storage key for a document file.
 * Format: documents/{userId}/{documentId}/{versionId}/original/{safeFilename}
 */
export function generateStorageKey(
  userId: string,
  documentId: string,
  versionId: string,
  originalFilename: string,
  type: 'original' | 'page' | 'thumbnail' = 'original',
  pageNumber?: number,
): string {
  const safeFilename = sanitizeFilename(originalFilename);

  switch (type) {
    case 'original':
      return `documents/${userId}/${documentId}/${versionId}/original/${safeFilename}`;
    case 'page':
      return `documents/${userId}/${documentId}/${versionId}/pages/page_${pageNumber ?? 1}.png`;
    case 'thumbnail':
      return `documents/${userId}/${documentId}/${versionId}/thumbnail.webp`;
    default:
      return `documents/${userId}/${documentId}/${versionId}/original/${safeFilename}`;
  }
}

/** Generate a short, human-readable slug from a string */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
