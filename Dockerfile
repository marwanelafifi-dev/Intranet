FROM node:22-alpine
RUN apk add --no-cache poppler-utils
WORKDIR /app
COPY package.json ./
COPY server.mjs auth-session.mjs audit-details.mjs audit-archive.mjs ./
COPY public ./public
COPY data ./data
ENV PORT=8080
ENV DATA_FILE=/app/data/intranet.json
EXPOSE 8080
CMD ["node", "server.mjs"]
