FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# Pin to commit before @vercel/ncc build changes (Apr 14 2026)
RUN git clone https://github.com/mimamch/wa-gateway.git . && \
    git checkout 9bd6b47

RUN npm install

# Create debug patch script that instruments message reception at runtime
RUN cat > /app/debug-patch.js << 'PATCH_EOF'
// Monkey-patch wa-multi-session to log all Baileys events
const origCreateSession = require('wa-multi-session').Whatsapp;
if (origCreateSession) {
  console.log('[DEBUG-PATCH] wa-multi-session Whatsapp class found');
}

// Patch the Socket module to log messages.upsert events
const fs = require('fs');
const path = require('path');

// Find and patch the compiled Socket/index.js
const socketPath = path.join(__dirname, 'node_modules/wa-multi-session/dist/Socket/index.js');
if (fs.existsSync(socketPath)) {
  let code = fs.readFileSync(socketPath, 'utf8');

  // Add logging before the messages.upsert handler
  if (code.includes('messages.upsert')) {
    const original = code;

    // Log all event keys when connection.update fires
    code = code.replace(
      /events\["connection\.update"\]/,
      '(console.log("[DEBUG] Baileys event keys:", Object.keys(events)), events["connection.update"])'
    );

    // Log when messages.upsert fires
    code = code.replace(
      /if\s*\(events\["messages\.upsert"\]\)/,
      'if (events["messages.upsert"] && (console.log("[DEBUG] messages.upsert fired! Count:", events["messages.upsert"]?.messages?.length || JSON.stringify(events["messages.upsert"]).substring(0, 200)), true))'
    );

    // Log onMessageReceived calls
    code = code.replace(
      /options\.onMessageReceived\?\.\(msg\)/g,
      '(console.log("[DEBUG] onMessageReceived called, remoteJid:", msg?.key?.remoteJid, "fromMe:", msg?.key?.fromMe, "type:", msg?.messageTimestamp ? "real" : "unknown"), options.onMessageReceived?.(msg))'
    );

    if (code !== original) {
      fs.writeFileSync(socketPath, code);
      console.log('[DEBUG-PATCH] Successfully patched Socket/index.js');
    } else {
      console.log('[DEBUG-PATCH] WARNING: No patterns matched in Socket/index.js');
      // Dump first 2000 chars for diagnosis
      console.log('[DEBUG-PATCH] File preview:', original.substring(0, 2000));
    }
  } else {
    console.log('[DEBUG-PATCH] WARNING: messages.upsert not found in Socket/index.js');
    const code = fs.readFileSync(socketPath, 'utf8');
    console.log('[DEBUG-PATCH] File preview:', code.substring(0, 2000));
  }
} else {
  console.log('[DEBUG-PATCH] WARNING: Socket/index.js not found at', socketPath);
  // List what's actually there
  const waDir = path.join(__dirname, 'node_modules/wa-multi-session');
  if (fs.existsSync(waDir)) {
    console.log('[DEBUG-PATCH] wa-multi-session contents:', fs.readdirSync(waDir));
    const distDir = path.join(waDir, 'dist');
    if (fs.existsSync(distDir)) {
      console.log('[DEBUG-PATCH] dist/ contents:', fs.readdirSync(distDir));
    }
    const srcDir = path.join(waDir, 'src');
    if (fs.existsSync(srcDir)) {
      console.log('[DEBUG-PATCH] src/ contents:', fs.readdirSync(srcDir));
    }
  }
}

// Also patch the webhook message handler in wa-gateway source
const webhookPath = path.join(__dirname, 'src/webhooks/message.ts');
if (fs.existsSync(webhookPath)) {
  let code = fs.readFileSync(webhookPath, 'utf8');
  if (!code.includes('[DEBUG]')) {
    // Add logging at the top of the function
    code = code.replace(
      'export const createWebhookMessage',
      'export const createWebhookMessage'
    );
    // Add a console.log right after the function opens
    code = code.replace(
      /if\s*\(!props\.baseUrl\)\s*return/,
      'console.log("[DEBUG] webhookMessage called, baseUrl:", props.baseUrl, "from:", JSON.stringify(props).substring(0, 300)); if (!props.baseUrl) return'
    );
    fs.writeFileSync(webhookPath, code);
    console.log('[DEBUG-PATCH] Successfully patched webhooks/message.ts');
  }
}

console.log('[DEBUG-PATCH] Patching complete');
PATCH_EOF

# Run the patch during build so we can see output
RUN node /app/debug-patch.js

# Also add a startup log to confirm debug mode
RUN echo 'console.log("[DEBUG] wa-gateway starting in DEBUG mode at", new Date().toISOString());' > /app/debug-startup.js

EXPOSE 5001

# Run debug startup script first, then the actual server
CMD ["sh", "-c", "node /app/debug-startup.js && npx tsx src/index.ts"]
