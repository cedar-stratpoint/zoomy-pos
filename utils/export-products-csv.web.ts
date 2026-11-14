import JSZip from 'jszip';
import { gatherExportCatalog } from './export-products-catalog';
import {
  CATALOG_CSV_NAME,
  productImageEntryPath,
  serializeCatalog,
} from './products-csv-format';

function archiveName(): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  return `zoomy-products-${dateStr}.zip`;
}

export async function exportProductsArchive(): Promise<void> {
  const { products, variantsByProductId, bundles } = await gatherExportCatalog();

  const zip = new JSZip();
  const productImageFilenames = new Map<number, string>();

  for (const p of products) {
    if (!p.image_uri) continue;
    try {
      const response = await fetch(p.image_uri);
      if (!response.ok) continue;
      const blob = await response.blob();
      const entryPath = productImageEntryPath(p.name);
      zip.file(entryPath, blob);
      productImageFilenames.set(p.id, entryPath);
    } catch {
      // missing/unreadable image — skip silently
    }
  }

  const csv = serializeCatalog(products, variantsByProductId, bundles, productImageFilenames);
  zip.file(CATALOG_CSV_NAME, csv);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = archiveName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
