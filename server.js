import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { google } from 'googleapis';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const app = express();
const port = Number(process.env.PORT || 3000);
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const embeddingCache = new Map();
const focusCache = new Map();
let currentFocus = null;
const gmailScope = 'https://www.googleapis.com/auth/gmail.readonly';
const credentialsPath = path.resolve(process.env.GMAIL_CREDENTIALS_PATH || 'credentials.json');
const gmailTokenPath = path.resolve(process.env.GMAIL_TOKEN_PATH || '.gmail-token.json');
const redirectUri = process.env.GMAIL_REDIRECT_URI || `http://localhost:${port}/api/gmail/oauth2callback`;

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public'));

function requireOpenAI(res) { if (client) return true; res.status(503).json({ error: 'Set OPENAI_API_KEY in .env before using ContextGuard.' }); return false; }
function cleanText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function cosine(a, b) { let dot = 0, aNorm = 0, bNorm = 0; for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; aNorm += a[i] ** 2; bNorm += b[i] ** 2; } return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm)); }
function gmailOAuth() {
  if (!existsSync(credentialsPath)) return null;
  const raw = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  const config = raw.web || raw.installed;
  if (!config?.client_id || !config?.client_secret) throw new Error('credentials.json needs a Google OAuth web client ID and secret.');
  return new google.auth.OAuth2(config.client_id, config.client_secret, redirectUri);
}
function gmailClient() {
  const auth = gmailOAuth();
  if (!auth || !existsSync(gmailTokenPath)) return null;
  auth.setCredentials(JSON.parse(readFileSync(gmailTokenPath, 'utf8')));
  return google.gmail({ version: 'v1', auth });
}
async function embed(text) { const value = cleanText(text); if (embeddingCache.has(value)) return embeddingCache.get(value); const result = await client.embeddings.create({ model: 'text-embedding-3-small', input: value }); const vector = result.data[0].embedding; embeddingCache.set(value, vector); return vector; }
async function focusStatement(rawFocus) { const input = cleanText(rawFocus); if (focusCache.has(input)) return focusCache.get(input); const result = await client.responses.create({ model: process.env.GPT_MODEL || 'gpt-5.6', input: [{ role: 'system', content: 'Rewrite the user\'s work focus into one concise, specific statement for semantic matching. Preserve product names, file names, git branches, technical terms, and intent. Return only the statement.' }, { role: 'user', content: input }] }); const statement = cleanText(result.output_text) || input; focusCache.set(input, statement); return statement; }
async function createFocus(rawFocus, source = 'manual') { const statement = await focusStatement(rawFocus); const vector = await embed(statement); return { rawFocus: cleanText(rawFocus), statement, vector, source, updatedAt: new Date().toISOString() }; }

app.post('/api/focus', async (req, res, next) => { try { if (!requireOpenAI(res)) return; const rawFocus = cleanText(req.body.focus); if (!rawFocus) return res.status(400).json({ error: 'A focus description is required.' }); const source = req.body.source === 'vscode' ? 'vscode' : 'manual'; const focus = await createFocus(rawFocus, source); if (req.body.activate !== false) currentFocus = focus; res.json(focus); } catch (error) { next(error); } });
app.get('/api/current-focus', (_req, res) => res.json({ focus: currentFocus }));
app.post('/api/score', async (req, res, next) => { try { if (!requireOpenAI(res)) return; const { focus, focusVector, items, threshold = 0.42 } = req.body; const safeItems = Array.isArray(items) ? items.slice(0, 100).map(item => ({ ...item, text: cleanText(item.text) })).filter(item => item.text) : []; if (!safeItems.length) return res.json({ items: [] }); const vector = Array.isArray(focusVector) ? focusVector : await embed(await focusStatement(focus)); const scored = await Promise.all(safeItems.map(async item => { const similarity = cosine(vector, await embed(item.text)); return { ...item, similarity, relevant: similarity >= Number(threshold) }; })); res.json({ items: scored }); } catch (error) { next(error); } });
app.get('/api/slack/channels', async (_req, res, next) => { try { if (!process.env.SLACK_USER_TOKEN) return res.status(503).json({ error: 'Add SLACK_USER_TOKEN to enable Slack.' }); const response = await fetch('https://slack.com/api/conversations.list?exclude_archived=true&limit=200', { headers: { Authorization: `Bearer ${process.env.SLACK_USER_TOKEN}` } }); const data = await response.json(); if (!data.ok) return res.status(400).json({ error: data.error || 'Slack request failed.' }); res.json({ channels: data.channels.map(({ id, name, is_member }) => ({ id, name, is_member })) }); } catch (error) { next(error); } });
app.get('/api/gmail/status', (_req, res, next) => { try { const auth = gmailOAuth(); res.json({ configured: Boolean(auth), connected: Boolean(gmailClient()), redirectUri }); } catch (error) { next(error); } });
app.get('/api/gmail/connect', (_req, res, next) => { try { const auth = gmailOAuth(); if (!auth) return res.status(503).send('Add credentials.json before connecting Gmail.'); res.redirect(auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [gmailScope] })); } catch (error) { next(error); } });
app.get('/api/gmail/oauth2callback', async (req, res, next) => { try { const auth = gmailOAuth(); if (!auth || !req.query.code) return res.status(400).send('Missing OAuth credentials or authorization code.'); const { tokens } = await auth.getToken(req.query.code); writeFileSync(gmailTokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 }); res.send('<h1>Gmail connected</h1><p>ContextGuard reads and scores subject lines only. You can return to the dashboard.</p>'); } catch (error) { next(error); } });
app.get('/api/gmail/subjects', async (_req, res, next) => { try { const gmail = gmailClient(); if (!gmail) return res.status(401).json({ error: 'Connect Gmail to load inbox subjects.', connectUrl: '/api/gmail/connect' }); const listed = await gmail.users.messages.list({ userId: 'me', q: 'in:inbox', maxResults: 50 }); const messages = listed.data.messages || []; const subjects = await Promise.all(messages.map(async ({ id, threadId }) => { const message = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject'], fields: 'id,threadId,payload/headers' }); const subject = message.data.payload?.headers?.find(header => header.name?.toLowerCase() === 'subject')?.value || '(no subject)'; return { id, threadId, subject }; })); res.json({ subjects }); } catch (error) { next(error); } });
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: error.message || 'Unexpected error.' }); });
app.listen(port, () => console.log(`ContextGuard is running at http://localhost:${port}`));
