/**
 * ESTERRA SMART MONEY TRACKER — Telegram -> Claude Vision -> Google Sheets
 * --------------------------------------------------------------------------
 * Snap a receipt photo in Telegram -> Claude Vision extracts the data ->
 * row gets appended to the "Transactions" tab of your Google Sheet.
 *
 * ARCHITECTURE NOTE (read this before you touch the code):
 * This writes to ONE sheet called "Transactions" — not per-month tabs like
 * "Transaction July 2026". That's deliberate. Monthly tabs were the root
 * cause of your dashboard silently ignoring 8 months of data last time.
 * The "Month" column (col G) is a formula-driven text field (=TEXT(date,
 * "YYYY-MM")) already in your sheet — that's how you filter/report by month,
 * without needing 12 separate tabs that can drift out of sync.
 *
 * FLOW:
 * 1. Telegram sends a webhook POST to this server when someone messages your bot.
 * 2. If the message has a photo, download it from Telegram's file API.
 * 3. Send the image to Claude (vision) with a system prompt that returns
 *    strict JSON matching your exact columns.
 * 4. Validate the JSON against your allowed Ledger/Type/Category lists.
 * 5. Append it as a new row via the Google Sheets API.
 * 6. Reply to the user in Telegram with a confirmation (or an error asking
 *    them to retry / enter manually).
 *
 * DEPLOY: Any Node host works (Railway, Render, Fly.io, a VPS, even your
 * own machine with a tunnel like ngrok for testing). Needs a public HTTPS
 * URL for Telegram's webhook to reach it.
 */

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// ---------- config (from environment variables, never hardcode these) ----------
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_SERVICE_ACCOUNT_JSON = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
const SHEET_ID = process.env.SHEET_ID;
const SHEET_TAB = 'Transactions'; // single master tab — see architecture note above

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ---------- your exact category lists (keep in sync with the Categories tab) ----------
const VALID_LEDGERS = ['Personal', 'Esterra'];
const VALID_TYPES = ['Income', 'Expense', 'Savings', 'Investment'];
const VALID_CATEGORIES = {
  Personal: ['Keperluan Rumah Tangga', 'Transport', 'Hiburan & Lifestyle', 'Pelaburan & Tabungan',
             'Pendidikan', 'Kesihatan', 'Sosial', 'Keperluan Peribadi', 'Lain-lain'],
  Esterra: ['Feedstock (Woodchip/Compost)', 'Payroll', 'Logistics & Transport', 'Utilities',
            'Equipment & Maintenance', 'Carbon Credit Revenue', 'Client Sales Revenue',
            'AR Collection', 'AP Payment', 'R&D / Partnership', 'Admin & Office', 'Other']
};

const EXTRACTION_SYSTEM_PROMPT = `Kau adalah pembantu ekstrak resit untuk Esterra Enterprise (syarikat biochar/carbon) dan kewangan peribadi pemiliknya, Danial.

Tengok gambar resit yang diberi, dan pulangkan JSON SAHAJA (tiada markdown fences, tiada teks lain) dengan struktur EXACT ni:

{
  "Date": "YYYY-MM-DD",
  "Ledger": "Personal" | "Esterra",
  "Description": "penerangan ringkas - nama kedai / item utama",
  "Type": "Income" | "Expense" | "Savings" | "Investment",
  "Category": "<mesti salah satu dari senarai kategori below, ikut Ledger>",
  "Amount": <nombor sahaja, tiada simbol RM>,
  "Remarks": "Auto-extracted via Telegram",
  "confidence": "high" | "medium" | "low",
  "needs_review": true | false
}

PERATURAN:
- Date: kalau tak jelas dalam resit, guna tarikh hari ni: {{TODAY}}
- Ledger: teka based on context.
  - Perkataan macam "feedstock", "woodchip", "payroll", "gaji pekerja", "client",
    "AR", "AP", "carbon credit", "logistik", "Tigasfera", "Ecosfera", nama syarikat
    pembekal industri => "Esterra"
  - Perbelanjaan harian biasa (makan, rokok, kopi, minyak kereta peribadi, groceries) => "Personal"
  - Kalau betul-betul tak pasti => default "Personal", set needs_review true
- Category MESTI padan EXACT dengan salah satu dari senarai ni (case-sensitive):
  Personal: Keperluan Rumah Tangga, Transport, Hiburan & Lifestyle, Pelaburan & Tabungan, Pendidikan, Kesihatan, Sosial, Keperluan Peribadi, Lain-lain
  Esterra: Feedstock (Woodchip/Compost), Payroll, Logistics & Transport, Utilities, Equipment & Maintenance, Carbon Credit Revenue, Client Sales Revenue, AR Collection, AP Payment, R&D / Partnership, Admin & Office, Other
- Amount: ambil TOTAL/JUMLAH akhir dari resit, bukan subtotal sebelum tax/service charge.
- confidence "low" kalau gambar kabur, amount tak jelas, atau kau terpaksa teka banyak benda.
- needs_review true kalau confidence bukan "high", ATAU kalau Ledger/Category kau teka dengan yakin rendah.
- Kalau kau LANGSUNG tak dapat baca amount dari resit tu, pulangkan {"error": true, "reason": "<sebab ringkas>"} sahaja.

Jangan tambah medan lain. Jangan tulis penjelasan. JSON sahaja.`;

async function extractReceiptData(imageBase64, mimeType) {
  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = EXTRACTION_SYSTEM_PROMPT.replace('{{TODAY}}', today);

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5', // swap to 'claude-sonnet-5' if Haiku misreads messy receipts
    max_tokens: 500,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: 'Ekstrak maklumat resit ni ikut format JSON yang ditetapkan.' }
      ]
    }]
  });

  const raw = response.content.find(b => b.type === 'text')?.text || '{"error": true}';
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

/** Extraction from a plain-text chat message (no photo) — e.g. "makan RM15, personal" */
async function extractFromText(text) {
  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = EXTRACTION_SYSTEM_PROMPT.replace('{{TODAY}}', today) +
    `\n\nKali ni takde gambar — kau dapat text chat je dari user. Ekstrak dari text tu.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: text }]
  });

  const raw = response.content.find(b => b.type === 'text')?.text || '{"error": true}';
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

/** Guard rails: never trust the model's category output blindly */
function validateExtraction(data) {
  if (!data || data.error) return { valid: false, reason: data?.reason || 'Tak dapat ekstrak data' };
  if (!VALID_LEDGERS.includes(data.Ledger)) return { valid: false, reason: `Ledger tak sah: ${data.Ledger}` };
  if (!VALID_TYPES.includes(data.Type)) return { valid: false, reason: `Type tak sah: ${data.Type}` };
  if (!VALID_CATEGORIES[data.Ledger]?.includes(data.Category)) {
    return { valid: false, reason: `Category "${data.Category}" tak padan dengan senarai ${data.Ledger}` };
  }
  if (typeof data.Amount !== 'number' || data.Amount <= 0) {
    return { valid: false, reason: `Amount tak sah: ${data.Amount}` };
  }
  return { valid: true };
}

async function appendToSheet(data) {
  const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_SERVICE_ACCOUNT_JSON,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const row = [
    data.Date,
    data.Ledger,
    data.Description,
    data.Type,
    data.Category,
    data.Amount,
    '', // Month column — leave blank, it's a formula already filled down the sheet
    data.Remarks || 'Auto-extracted via Telegram'
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:H`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

async function downloadTelegramPhoto(fileId) {
  const fileInfoRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
  const fileInfo = await fileInfoRes.json();
  const filePath = fileInfo.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
  const imgRes = await fetch(fileUrl);
  const buffer = await imgRes.arrayBuffer();
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return { base64: Buffer.from(buffer).toString('base64'), mimeType };
}

async function sendTelegramMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// ---------- webhook endpoint ----------
app.post('/telegram-webhook', async (req, res) => {
  res.sendStatus(200); // ack Telegram immediately, do the work after

  try {
    const message = req.body.message;
    if (!message) return;
    const chatId = message.chat.id;

    let extracted;
    if (message.photo) {
      const fileId = message.photo[message.photo.length - 1].file_id; // highest resolution
      const { base64, mimeType } = await downloadTelegramPhoto(fileId);
      extracted = await extractReceiptData(base64, mimeType);
    } else if (message.text) {
      extracted = await extractFromText(message.text);
    } else {
      return;
    }

    const check = validateExtraction(extracted);
    if (!check.valid) {
      await sendTelegramMessage(chatId,
        `⚠️ Tak dapat proses: ${check.reason}\n\nCuba hantar gambar lebih jelas, atau taip macam ni:\n"Makan RM15, Personal, Hiburan & Lifestyle"`);
      return;
    }

    await appendToSheet(extracted);

    const reviewFlag = extracted.needs_review ? '\n\n🔍 Sila semak — confidence rendah, mungkin salah kategori/ledger.' : '';
    await sendTelegramMessage(chatId,
      `✅ Rekod Berjaya Disimpan!\n\n` +
      `📝 ${extracted.Description}\n` +
      `💰 RM ${extracted.Amount}\n` +
      `📊 ${extracted.Type} — ${extracted.Category}\n` +
      `🗂️ ${extracted.Ledger}\n` +
      `📅 ${extracted.Date}` +
      reviewFlag
    );
  } catch (err) {
    console.error(err);
  }
});

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
