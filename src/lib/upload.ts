import { createClient } from '@/lib/supabase/client';

/** Shrinks a photo in the browser (max 1200px, WebP) so menus load fast on mobile data. */
async function compress(file: File, maxSize = 1200): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/webp', 0.85));
}

/** Uploads into the cafe's own folder (storage rules only allow that) and returns the public URL. */
export async function uploadCafeImage(cafeId: string, folder: 'items' | 'branding', file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const blob = await compress(file, folder === 'branding' ? 512 : 1200);
  const path = `${cafeId}/${folder}/${crypto.randomUUID()}.webp`;
  const supabase = createClient();
  const { error } = await supabase.storage.from('cafe-media').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from('cafe-media').getPublicUrl(path).data.publicUrl;
}
