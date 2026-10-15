FROM node:26.11.1-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:26.11.1-bookworm-slim AS runtime
ARG VCS_REF=local
LABEL org.opencontainers.image.revision=$VCS_REF
ENV NODE_ENV=production PORT=3000 APP_REVISION=$VCS_REF
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node config ./config
COPY --chown=node:node lib ./lib
COPY --chown=node:node routes ./routes
COPY --chown=node:node utils ./utils
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=8s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready',{signal:AbortSignal.timeout(6000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(e=>{console.error(e.message);process.exit(1)})"
CMD ["node", "server.js"]

FROM runtime AS integration
COPY --chown=node:node integration ./integration
CMD ["npm", "run", "test:integration"]
