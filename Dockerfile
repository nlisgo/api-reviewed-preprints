ARG node_version=20.15-alpine3.19

FROM node:${node_version} as base
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .

# Development stage
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["yarn", "start:dev"]

# Production stage
FROM base AS prod
ENV NODE_ENV=production
RUN yarn build
EXPOSE 3000
CMD ["yarn", "start"]
