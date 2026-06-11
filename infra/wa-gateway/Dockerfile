FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# Pin to commit before @vercel/ncc build changes (Apr 14 2026)
RUN git clone https://github.com/mimamch/wa-gateway.git . && \
    git checkout 9bd6b47

RUN npm install

# Debug: dump the wa-multi-session Socket file to see exact patterns to patch
RUN echo "=== WA-MULTI-SESSION STRUCTURE ===" && \
    ls -la node_modules/wa-multi-session/ && \
    echo "=== DIST DIR ===" && \
    ls -la node_modules/wa-multi-session/dist/ 2>/dev/null || echo "no dist dir" && \
    echo "=== DIST/SOCKET ===" && \
    ls -la node_modules/wa-multi-session/dist/Socket/ 2>/dev/null || echo "no dist/Socket dir" && \
    echo "=== SRC/SOCKET ===" && \
    ls -la node_modules/wa-multi-session/src/Socket/ 2>/dev/null || echo "no src/Socket dir" && \
    echo "=== PACKAGE.JSON ===" && \
    cat node_modules/wa-multi-session/package.json | head -30 && \
    echo "=== SOCKET INDEX CONTENT (first 100 lines) ===" && \
    head -100 node_modules/wa-multi-session/dist/Socket/index.js 2>/dev/null || \
    head -100 node_modules/wa-multi-session/src/Socket/index.ts 2>/dev/null || \
    echo "no Socket index found" && \
    echo "=== SEARCHING FOR messages.upsert ===" && \
    grep -rn "messages.upsert" node_modules/wa-multi-session/ 2>/dev/null | head -20 && \
    echo "=== SEARCHING FOR onMessageReceived ===" && \
    grep -rn "onMessageReceived" node_modules/wa-multi-session/ 2>/dev/null | head -20 && \
    echo "=== WA-GATEWAY WEBHOOK MESSAGE.TS ===" && \
    cat src/webhooks/message.ts && \
    echo "=== DONE ==="

EXPOSE 5001

CMD ["npx", "tsx", "src/index.ts"]
