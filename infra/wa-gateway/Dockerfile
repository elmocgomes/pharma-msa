FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# Pin to commit before @vercel/ncc build changes (Apr 14 2026)
RUN git clone https://github.com/mimamch/wa-gateway.git . && \
    git checkout 9bd6b47

RUN npm install

# === DEBUG PATCHES ===
# Patch wa-multi-session Whatsapp.js with exact string matches from the compiled code
RUN node -e "\
const fs = require('fs');\
const f = 'node_modules/wa-multi-session/dist/Whatsapp/Whatsapp.js';\
let c = fs.readFileSync(f, 'utf8');\
let changes = 0;\
\
/* Patch 1: Add event key logging at sock.ev.process entry (both startSession and startSessionWithPairingCode) */\
const oldEvProcess = 'sock.ev.process((events) => __awaiter(this, void 0, void 0, function* () {';\
const newEvProcess = 'sock.ev.process((events) => __awaiter(this, void 0, void 0, function* () { console.log(\"[DEBUG-WA] Baileys events:\", Object.keys(events));';\
const count1 = (c.match(/sock\.ev\.process/g) || []).length;\
c = c.split(oldEvProcess).join(newEvProcess);\
changes += count1;\
console.log('Patch 1: sock.ev.process found', count1, 'times');\
\
/* Patch 2: Add logging before messages.upsert handler */\
const oldUpsert = 'if (events[\"messages.upsert\"]) {';\
const newUpsert = 'if (events[\"messages.upsert\"]) { console.log(\"[DEBUG-WA] messages.upsert! count:\", events[\"messages.upsert\"].messages?.length, \"type:\", events[\"messages.upsert\"].type);';\
const count2 = (c.match(/events\[\"messages\.upsert\"\]\)/g) || []).length;\
c = c.split(oldUpsert).join(newUpsert);\
changes += count2;\
console.log('Patch 2: messages.upsert found', count2, 'times');\
\
/* Patch 3: Log the protocolMessage filter */\
const oldProto = '// ignore history sync messages';\
const newProto = '// ignore history sync messages\\nconsole.log(\"[DEBUG-WA] protocolMessage detected, skipping\");';\
c = c.split(oldProto).join(newProto);\
\
/* Patch 4: Log onMessageReceived call */\
const oldCallback = '(_s = options.onMessageReceived) === null';\
const newCallback = '(console.log(\"[DEBUG-WA] calling onMessageReceived, jid:\", msg?.key?.remoteJid, \"fromMe:\", msg?.key?.fromMe), _s = options.onMessageReceived) === null';\
c = c.split(oldCallback).join(newCallback);\
\
const oldCallback2 = '(_t = options.onMessageReceived) === null';\
const newCallback2 = '(console.log(\"[DEBUG-WA] calling onMessageReceived (pairing), jid:\", msg?.key?.remoteJid, \"fromMe:\", msg?.key?.fromMe), _t = options.onMessageReceived) === null';\
c = c.split(oldCallback2).join(newCallback2);\
\
fs.writeFileSync(f, c);\
console.log('Total patches applied:', changes, '+ proto + callbacks');\
"

# Patch wa-gateway webhook message handler
RUN node -e "\
const fs = require('fs');\
const f = 'src/webhooks/message.ts';\
let c = fs.readFileSync(f, 'utf8');\
c = c.replace(\
  'if (!props.baseUrl) return;',\
  'console.log(\"[DEBUG-WH] webhookMessage called, baseUrl:\", props.baseUrl, \"from:\", message.key.remoteJid, \"fromMe:\", message.key.fromMe); if (!props.baseUrl) return;'\
);\
c = c.replace(\
  'webhookClient.post(endpoint, body).catch(console.error);',\
  'console.log(\"[DEBUG-WH] POSTing to\", endpoint, \"session:\", body.session, \"from:\", body.from, \"msg:\", body.message?.substring(0, 100)); webhookClient.post(endpoint, body).then(r => console.log(\"[DEBUG-WH] POST ok, status:\", r.status)).catch(e => console.error(\"[DEBUG-WH] POST error:\", e.message));'\
);\
fs.writeFileSync(f, c);\
console.log('Patched webhook message.ts');\
"

# Patch wa-gateway whatsapp.ts to wrap onMessageReceived
RUN node -e "\
const fs = require('fs');\
const f = 'src/whatsapp.ts';\
let c = fs.readFileSync(f, 'utf8');\
c = c.replace(\
  'onMessageReceived: webhookMessage,',\
  'onMessageReceived: (msg) => { console.log(\"[DEBUG-GW] onMessageReceived in whatsapp.ts, from:\", msg?.key?.remoteJid, \"fromMe:\", msg?.key?.fromMe, \"hasMessage:\", !!msg?.message); return webhookMessage(msg); },'\
);\
fs.writeFileSync(f, c);\
console.log('Patched whatsapp.ts');\
"

EXPOSE 5001

CMD ["npx", "tsx", "src/index.ts"]
