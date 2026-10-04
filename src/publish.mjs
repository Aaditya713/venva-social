// Publishes a single image post via the Instagram API (Instagram Login flavour).
// Needs IG_USER_ID and IG_ACCESS_TOKEN. The image must be at a public HTTPS URL.
const API = `https://graph.instagram.com/${process.env.IG_API_VERSION || 'v23.0'}`;

async function call(method, pathname, params) {
  const body = new URLSearchParams({ ...params, access_token: process.env.IG_ACCESS_TOKEN });
  const res = method === 'GET'
    ? await fetch(`${API}/${pathname}?${body}`)
    : await fetch(`${API}/${pathname}`, { method, body });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`Instagram ${pathname}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

export async function publishImage(imageUrl, caption) {
  const userId = process.env.IG_USER_ID;
  if (!userId || !process.env.IG_ACCESS_TOKEN) throw new Error('IG_USER_ID and IG_ACCESS_TOKEN must be set');

  const { id: containerId } = await call('POST', `${userId}/media`, { image_url: imageUrl, caption });

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

// Long-lived tokens last 60 days; refreshing returns a new 60-day token.
export async function refreshToken() {
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
    grant_type: 'ig_refresh_token', access_token: process.env.IG_ACCESS_TOKEN })}`);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`Token refresh failed: ${JSON.stringify(json.error ?? json)}`);
  return json; // { access_token, token_type, expires_in }
}
