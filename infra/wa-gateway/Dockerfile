FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# Pin to commit before @vercel/ncc build changes (Apr 14 2026)
# Later commits (May 6+) changed wa-multi-session to v4.3+ which breaks
# inbound message handling via the Redis adapter refactor
RUN git clone https://github.com/mimamch/wa-gateway.git . && \
    git checkout 9bd6b47

RUN npm install

EXPOSE 5001

CMD ["npx", "tsx", "src/index.ts"]
