# SynAmp brain (and the librarian, same image) — no build step; Node strips the
# TypeScript types at runtime.
#
# Built from the apps/ folder (see deploy/docker-compose.yml), so it can
# fingerprint the web app's code too: that is how the app knows whether a
# newer copy on the NAS is waiting for Build in Container Manager.

# 1. Fingerprint the code these images are built from. Docker re-runs this only
#    when that code changed, so build.json always matches what's inside.
FROM node:22-alpine AS fingerprint
WORKDIR /apps
COPY brain/src ./brain/src
COPY web/src ./web/src
COPY web/index.html web/package.json web/package-lock.json ./web/
RUN node --experimental-strip-types brain/src/version.ts /apps > /build.json

# 2. The brain itself. ffmpeg makes the lighter streams for mobile data
#    (src/session/lighter.ts); without it the player just gets the original files.
FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY brain/src ./src
COPY --from=fingerprint /build.json ./build.json

ENV NODE_ENV=production \
    BRAIN_HOST=0.0.0.0 \
    BRAIN_PORT=3001

EXPOSE 3001

# No dependencies yet, so no install step.
CMD ["node", "--experimental-strip-types", "src/index.ts"]
