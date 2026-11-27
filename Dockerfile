FROM node:24-bookworm-slim
WORKDIR /srv/portal
COPY backend ./backend
COPY docs ./docs
ENV PORT=8080 PORTAL_BIND=0.0.0.0 PORTAL_DATA=/data PORTAL_FRONTEND_URL=https://comanda316.github.io/viberp-government/
EXPOSE 8080
CMD ["node","backend/server.mjs"]
