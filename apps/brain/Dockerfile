# SynAmp brain — no build step; Node strips the TypeScript types at runtime.
FROM node:22-alpine

WORKDIR /app

COPY src ./src

ENV NODE_ENV=production \
    BRAIN_HOST=0.0.0.0 \
    BRAIN_PORT=3001

EXPOSE 3001

# No dependencies yet, so no install step. Add `pnpm install --prod` here once
# the brain grows real dependencies.
CMD ["node", "--experimental-strip-types", "src/index.ts"]
