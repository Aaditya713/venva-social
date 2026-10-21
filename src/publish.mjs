// Publishes a single image post or a Reel via the Instagram API (Instagram Login flavour).
// Needs IG_USER_ID and IG_ACCESS_TOKEN. Media must be at a public HTTPS URL.
const API = process.env.IG_API_BASE || `https://graph.instagram.com/${process.env.IG_API_VERSION || 'v23.0'}`; // IG_API_BASE: tests only

async function call(method, pathname, params) {
  const body = new URLSearchParams({ ...params, access_token: process.env.IG_ACCESS_TOKEN });
  const res = method === 'GET'
    ? await fetch(`${API}/${pathname}?${body}`)
    : await fetch(`${API}/${pathname}`, { method, body });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`Instagram ${pathname}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

export async function publishImage(imageUrl, caption, altText) {
  const userId = process.env.IG_USER_ID;
  if (!userId || !process.env.IG_ACCESS_TOKEN) throw new Error('IG_USER_ID and IG_ACCESS_TOKEN must be set');

  let containerId;
  try {
    ({ id: containerId } = await call('POST', `${userId}/media`, { image_url: imageUrl, caption, ...(altText && { alt_text: altText }) }));
  } catch (err) {
    if (!altText) throw err;
    console.warn(`::warning::Retrying without alt text (${err.message})`);
    ({ id: containerId } = await call('POST', `${userId}/media`, { image_url: imageUrl, caption }));
  }

  // Instagram fetches and processes the image asynchronously.
  for (let i = 0; i < 20; i++) {
    const { status_code } = await call('GET', containerId, { fields: 'status_code' });
    if (status_code === 'FINISHED') break;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Media container ${status_code}`);
    await new Promise(r => setTimeout(r, 3000));
  }

  const { id: mediaId } = await call('POST', `${userId}/media_publish`, { creation_id: containerId });
  return mediaId;
}

// Publishes a Reel (also shown in the feed). The video and cover must be at public HTTPS URLs.
export async function publishReel(videoUrl, coverUrl, caption) {
  const userId = process.env.IG_USER_ID;
  if (!userId || !process.env.IG_ACCESS_TOKEN) throw new Error('IG_USER_ID and IG_ACCESS_TOKEN must be set');
  const { id: containerId } = await call('POST', `${userId}/media`, {
    media_type: 'REELS', video_url: videoUrl, cover_url: coverUrl, caption, share_to_feed: 'true' });

  // Videos take longer than images to process: allow up to 10 minutes.
  for (let i = 0; ; i++) {
    const { status_code, status } = await call('GET', containerId, { fields: 'status_code,status' });
    if (status_code === 'FINISHED') break;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Reel container ${status_code}: ${status ?? ''}`);
    if (i >= 60) throw new Error('Reel still processing after 10 minutes');
    await new Promise(r => setTimeout(r, 10000));
  }

  const { id: mediaId } = await call('POST', `${userId}/media_publish`, { creation_id: containerId });
  return mediaId;
}

// Returns the media id if one of the account's latest posts already has this caption.
export async function findRecentPost(caption) {
  const { data = [] } = await call('GET', `${process.env.IG_USER_ID}/media`, { fields: 'id,caption', limit: '5' });
  return data.find(m => m.caption?.trim() === caption.trim())?.id ?? null;
}

// Long-lived tokens last 60 days; refreshing returns a new 60-day token.
export async function refreshToken() {
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
    grant_type: 'ig_refresh_token', access_token: process.env.IG_ACCESS_TOKEN })}`);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`Token refresh failed: ${JSON.stringify(json.error ?? json)}`);
  return json; // { access_token, token_type, expires_in }
}
