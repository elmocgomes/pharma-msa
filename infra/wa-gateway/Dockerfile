FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# Pin to a specific commit for reproducibility
RUN git clone https://github.com/mimamch/wa-gateway.git . && \
    git checkout master

RUN npm install

EXPOSE 5001

CMD ["npx", "tsx", "src/index.ts"]
