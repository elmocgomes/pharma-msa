FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# Pin to commit before @vercel/ncc build changes (Apr 14 2026)
RUN git clone https://github.com/mimamch/wa-gateway.git . && \
    git checkout 9bd6b47

RUN npm install

# === DEBUG PATCHES ===
# Patch 1: Log all Baileys event keys in Whatsapp.js (the class wa-gateway actually uses)
RUN node -e " \
const fs = require('fs'); \
const f = 'node_modules/wa-multi-session/dist/Whatsapp/Whatsapp.js'; \
let c = fs.readFileSync(f, 'utf8'); \
/* Add event logging at the start of sock.ev.process callback */ \
c = c.replace( \
  /sock\.ev\.process\(\(events\)\s*=>\s*__awaiter\(void 0, void 0, void 0, function\* \(\)\s*\{/g, \
  'sock.ev.process((events) => __awaiter(void 0, void 0, void 0, function* () { console.log(\"[DEBUG-WA] Baileys events:\", Object.keys(events));' \
); \
/* Log when messages.upsert fires */ \
c = c.replace( \
  /if \(events\[\"messages\.upsert\"\]\) \{/g, \
  'if (events[\"messages.upsert\"]) { console.log(\"[DEBUG-WA] messages.upsert fired! msgs:\", JSON.stringify(events[\"messages.upsert\"]).substring(0, 500));' \
); \
/* Log onMessageReceived calls */ \
c = c.replace( \
  /options\.onMessageReceived\)\s*===\s*null/g, \
  'options.onMessageReceived) === null || void console.log(\"[DEBUG-WA] onMessageReceived about to fire, fromMe:\", msg === null || msg === void 0 ? void 0 : msg.key.fromMe, \"jid:\", msg === null || msg === void 0 ? void 0 : msg.key.remoteJid), false' \
); \
fs.writeFileSync(f, c); \
console.log('Patched Whatsapp.js successfully'); \
"

# Patch 2: Log in webhook message handler (the wa-gateway source TS file)
RUN node -e " \
const fs = require('fs'); \
const f = 'src/webhooks/message.ts'; \
let c = fs.readFileSync(f, 'utf8'); \
c = c.replace( \
  'if (!props.baseUrl) return;', \
  'console.log(\"[DEBUG-WH] webhookMessage called, baseUrl:\", props.baseUrl, \"from:\", message.key.remoteJid, \"fromMe:\", message.key.fromMe); if (!props.baseUrl) return;' \
); \
c = c.replace( \
  'webhookClient.post(endpoint, body).catch(console.error);', \
  'console.log(\"[DEBUG-WH] POSTing to\", endpoint, \"body:\", JSON.stringify(body).substring(0, 300)); webhookClient.post(endpoint, body).then(r => console.log(\"[DEBUG-WH] POST response:\", r.status)).catch(e => console.error(\"[DEBUG-WH] POST error:\", e.message));' \
); \
fs.writeFileSync(f, c); \
console.log('Patched webhook message.ts successfully'); \
"

# Patch 3: Log in wa-gateway's whatsapp.ts to confirm onMessageReceived is wired up
RUN node -e " \
const fs = require('fs'); \
const f = 'src/whatsapp.ts'; \
let c = fs.readFileSync(f, 'utf8'); \
/* Add logging right after the Whatsapp instantiation or config */ \
if (c.includes('onMessageReceived')) { \
  c = c.replace( \
    'onMessageReceived: webhookMessage', \
    'onMessageReceived: (msg) => { console.log(\"[DEBUG-WA-GW] onMessageReceived fired in whatsapp.ts, from:\", msg?.key?.remoteJid); return webhookMessage(msg); }' \
  ); \
  console.log('Patched whatsapp.ts onMessageReceived'); \
} else { \
  console.log('WARNING: onMessageReceived not found in whatsapp.ts'); \
  console.log('File content:', c.substring(0, 1000)); \
} \
fs.writeFileSync(f, c); \
"

# Patch 4: Set pino log level to debug temporarily to see Baileys internal logs
RUN node -e " \
const fs = require('fs'); \
const f = 'node_modules/wa-multi-session/dist/Whatsapp/Whatsapp.js'; \
let c = fs.readFileSync(f, 'utf8'); \
c = c.replace(/level:\s*['\"]silent['\"]/g, 'level: \"info\"'); \
fs.writeFileSync(f, c); \
console.log('Set pino log level to info'); \
"

EXPOSE 5001

CMD ["npx", "tsx", "src/index.ts"]
