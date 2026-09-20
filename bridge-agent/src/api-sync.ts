export async function pushToApi(payload: unknown) {
  const url = process.env.CURAM_INGEST_URL;
  const token = process.env.BRIDGE_API_KEY;
  if (!url || !token) return;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
