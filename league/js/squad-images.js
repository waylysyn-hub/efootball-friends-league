const BUCKET = 'squad-player-images';
const SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 512;
const WEBP_QUALITY = 0.86;

export function validateSquadPhotoFile(file) {
  if (!file) return 'اختر صورة أولًا.';
  if (!SOURCE_TYPES.has(file.type)) return 'استخدم صورة JPG أو PNG أو WebP.';
  if (file.size > MAX_SOURCE_BYTES) return 'حجم الصورة الأصلية يجب ألا يتجاوز 10 ميغابايت.';
  return '';
}

async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('تعذّر تجهيز الصورة للرفع.')),
    type, quality
  ));
}

export async function prepareSquadPhoto(file) {
  const validation = validateSquadPhotoFile(file);
  if (validation) throw new Error(validation);
  const source = await decodeImage(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  if (!width || !height) throw new Error('تعذّر قراءة أبعاد الصورة.');

  const crop = Math.min(width, height);
  const output = Math.min(MAX_EDGE, crop);
  const canvas = document.createElement('canvas');
  canvas.width = output;
  canvas.height = output;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('المتصفح لا يدعم تجهيز الصور.');

  context.drawImage(
    source,
    Math.round((width - crop) / 2),
    Math.round((height - crop) / 2),
    crop, crop,
    0, 0, output, output
  );
  source.close?.();

  const blob = await canvasBlob(canvas, 'image/webp', WEBP_QUALITY);
  if (blob.size > 2 * 1024 * 1024) throw new Error('تعذّر ضغط الصورة إلى حجم مناسب.');
  return blob;
}

export function managedSquadPhotoPath(ownerPlayerId, memberId) {
  return `${ownerPlayerId}/${memberId}/${crypto.randomUUID()}.webp`;
}

export async function uploadSquadPhoto(sb, file, ownerPlayerId, memberId) {
  const blob = await prepareSquadPhoto(file);
  const path = managedSquadPhotoPath(ownerPlayerId, memberId);
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    await removeSquadPhotoObject(sb, path);
    throw new Error('تعذّر إنشاء رابط الصورة بعد الرفع.');
  }
  return { path, url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function removeSquadPhotoObject(sb, path) {
  if (!path) return;
  const { error } = await sb.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
