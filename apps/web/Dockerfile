# SynAmp web — build the SPA, then serve it as static files.
#
# npm (bundled with Node) rather than pnpm via corepack: corepack downloads
# pnpm at build time and verifies its signature, which breaks whenever the
# signing keys rotate ("failed to solve … pnpm install"). package-lock.json
# pins every dependency, including the Alpine (musl) build tools.

# The build runs on the build machine's own chip ($BUILDPLATFORM): its output is
# plain files, the same for every chip, so ARM release images need no emulated
# npm install. Only the small nginx stage below is per chip.
FROM --platform=$BUILDPLATFORM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.31.6-alpine3.24@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
