FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# Pin to commit before @vercel/ncc build changes (Apr 14 2026)
RUN git clone https://github.com/mimamch/wa-gateway.git . && \
    git checkout 9bd6b47

RUN npm install

# Dump Whatsapp.js lines around messages.upsert for exact patch targeting
RUN echo "=== WHATSAPP.JS AROUND messages.upsert ===" && \
    grep -n -B5 -A10 "messages.upsert" node_modules/wa-multi-session/dist/Whatsapp/Whatsapp.js && \
    echo "=== WHATSAPP.JS AROUND sock.ev ===" && \
    grep -n -B2 -A5 "sock.ev" node_modules/wa-multi-session/dist/Whatsapp/Whatsapp.js && \
    echo "=== WHATSAPP.JS AROUND onMessageReceived ===" && \
    grep -n -B2 -A5 "onMessageReceived" node_modules/wa-multi-session/dist/Whatsapp/Whatsapp.js && \
    echo "=== WA-GATEWAY src/whatsapp.ts FULL ===" && \
    cat src/whatsapp.ts && \
    echo "=== DONE ==="

EXPOSE 5001

CMD ["npx", "tsx", "src/index.ts"]
