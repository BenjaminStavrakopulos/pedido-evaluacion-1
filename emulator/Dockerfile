FROM node:24.16.0-trixie-slim
ARG VCS_REF=local
LABEL org.opencontainers.image.revision=$VCS_REF
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-21-jre-headless ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/emulator
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force && chown node:node /opt/emulator
ENV HOME=/home/node CI=true FIREBASE_CLI_DISABLE_UPDATE_CHECK=true
USER node
RUN ./node_modules/.bin/firebase setup:emulators:firestore
COPY --chown=node:node firebase.json firestore.rules ./
EXPOSE 8080 9099
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD node -e "Promise.all([8080,9099].map(port=>fetch('http://127.0.0.1:'+port,{signal:AbortSignal.timeout(3000)}))).catch(e=>{console.error(e.message);process.exit(1)})"
CMD ["./node_modules/.bin/firebase", "emulators:start", "--only", "auth,firestore", "--project", "demo-monsite-evaluacion", "--config", "firebase.json", "--non-interactive"]
