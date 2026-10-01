const BUCKET = 'squad-player-images';
const SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 512;
const WEBP_QUALITY = 0.86;

const GOOGLE_PAGE_HOSTS = new Set(['google.com', 'www.google.com']);

export function normalizeExternalSquadPhotoUrl(value) {
  if (!value) return '';
  try {
    let url = new URL(String(value).trim());
    if (url.protocol !== 'https:' || url.username || url.password) return '';

    const host = url.hostname.toLowerCase();
    if (GOOGLE_PAGE_HOSTS.has(host) && url.pathname === '/imgres') {
      const direct = url.searchParams.get('imgurl');
      if (!direct) return '';
      url = new URL(direct);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
    } else if (
      host === 'share.google' ||
      (GOOGLE_PAGE_HOSTS.has(host) && ['/search', '/url', '/images'].some(path => url.pathname.startsWith(path)))
    ) {
      return '';
    }
    return url.href;
  } catch {
    return '';
  }
}

export async function verifyExternalSquadPhotoUrl(value, timeoutMs = 8000) {
  const url = normalizeExternalSquadPhotoUrl(value);
  if (!url) throw new Error('استخدم رابط صورة مباشر يبدأ بـ https://، وليس رابط صفحة بحث أو مشاركة من Google.');
  await new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.src = '';
      reject(new Error('تعذّر تحميل الصورة من الرابط. جرّب رابط صورة مباشر أو ارفع الصورة من جهازك.'));
    }, timeoutMs);
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      clearTimeout(timer);
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve();
      else reject(new Error('الرابط لا يشير إلى صورة قابلة للعرض.'));
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('الرابط لا يشير إلى صورة مباشرة أو أن الموقع يمنع عرضها خارجيًا. استخدم رفع الصورة من جهازك.'));
    };
    image.src = url;
  });
  return url;
}

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

export function managedSquadPhotoPath(ownerPlayerId, memberId, objectId = crypto.randomUUID()) {
  return `${ownerPlayerId}/${memberId}/${objectId}.webp`;
}

export async function uploadSquadPhoto(sb, file, ownerPlayerId, memberId, objectId) {
  const blob = await prepareSquadPhoto(file);
  const path = managedSquadPhotoPath(ownerPlayerId, memberId, objectId);
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error && error.statusCode !== '409' && error.status !== 409 && error.error !== 'Duplicate') throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    await removeSquadPhotoObject(sb, path);
    throw new Error('تعذّر إنشاء رابط الصورة بعد الرفع.');
  }
  // The object UUID already versions immutable uploads; retries need the same URL.
  return { path, url: data.publicUrl };
}

export async function removeUnusedSquadPhoto(sb, path) {
  if (!path) return;
  const { data, error } = await sb.from('squad_players').select('id').eq('photo_path', path).limit(1);
  if (error || !data || data.length) return;
  await removeSquadPhotoObject(sb, path);
}

export async function removeSquadPhotoObject(sb, path) {
  if (!path) return;
  const { error } = await sb.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
