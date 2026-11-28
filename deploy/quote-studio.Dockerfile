FROM node:24-alpine
WORKDIR /app
COPY public/photo-booth-quote/ ./public/photo-booth-quote/
COPY deploy/quote-server.mjs ./deploy/quote-server.mjs
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "deploy/quote-server.mjs"]
