import api from './api';

export async function uploadMedia(file, folder = 'crm/uploads') {
  if (!file) throw new Error('Please select a file.');
  const signatureResponse = await api.post('/assets/cloudinary-signature', { folder });
  const { cloudName, apiKey, timestamp, signature, folder: signedFolder } = signatureResponse.data || {};
  if (!cloudName || !apiKey || !signature) throw new Error('Cloudinary upload is not configured.');

  const body = new FormData();
  body.append('file', file);
  body.append('api_key', apiKey);
  body.append('timestamp', String(timestamp));
  body.append('signature', signature);
  body.append('folder', signedFolder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`, { method: 'POST', body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || 'Cloudinary upload failed.');

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    url: result.secure_url,
    secureUrl: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format || '',
    bytes: result.bytes || file.size,
    width: result.width || null,
    height: result.height || null,
    duration: result.duration || null,
    uploadedAt: new Date().toISOString()
  };
}

export async function uploadMediaBatch(files, folder = 'crm/uploads') {
  return Promise.all(Array.from(files || []).map((file) => uploadMedia(file, folder)));
}

export function mediaUrl(value) {
  return value?.secureUrl || value?.url || value?.dataUrl || (typeof value === 'string' ? value : '');
}
