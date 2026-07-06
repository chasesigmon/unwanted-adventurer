FROM mongo:7

# Seeds the "text-arena" database/collection/index on first container start.
COPY init-mongo.js /docker-entrypoint-initdb.d/init-mongo.js
