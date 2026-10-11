FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY public ./public
COPY data ./data
ENV PORT=8080
ENV DATA_FILE=/app/data/intranet.json
EXPOSE 8080
CMD ["node", "server.mjs"]
