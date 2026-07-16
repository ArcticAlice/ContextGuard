const API = 'http://localhost:3000/api';
const get = keys => chrome.storage.local.get(keys);
async function refresh() {
  const { focus, focusVector, threshold = 0.42 } = await get(['focus', 'focusVector', 'threshold']);
  if (!focusVector) return { error: 'Set a focus in ContextGuard first.' };
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const items = tabs.filter(t => t.id && t.title && !t.url?.startsWith('chrome://')).map(t => ({ id: t.id, text: t.title }));
  const r = await fetch(`${API}/score`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ focus, focusVector, threshold, items }) });
  const data = await r.json(); if (!r.ok) return { error: data.error };
  const low = data.items.filter(i => !i.relevant).map(i => i.id);
  if (low.length) { const groupId = await chrome.tabs.group({ tabIds: low }); await chrome.tabGroups.update(groupId, { title: 'Low context', color: 'grey', collapsed: true }); }
  return data;
}
chrome.runtime.onMessage.addListener((message, _sender, respond) => { if (message.type === 'refresh') refresh().then(respond).catch(e => respond({ error: e.message })); return true; });
