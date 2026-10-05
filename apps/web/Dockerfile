# SynAmp web — build the SPA, then serve it as static files.
#
# npm (bundled with Node) rather than pnpm via corepack: corepack downloads
# pnpm at build time and verifies its signature, which breaks whenever the
# signing keys rotate ("failed to solve … pnpm install"). package-lock.json
# pins every dependency, including the Alpine (musl) build tools.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
