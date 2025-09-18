ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-trixie

# Use production node environment by default.
ENV NODE_ENV production


WORKDIR /usr/src/app

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.npm to speed up subsequent builds.
# Leverage a bind mounts to package.json and package-lock.json to avoid having to copy them into
# into this layer.
RUN --mount=type=bind,source=./package.json,target=package.json \
    --mount=type=bind,source=./package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg
RUN echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt trixie-pgdg main" > /etc/apt/sources.list.d/pgdg.list


RUN apt-get update && apt-get install -y build-essential pkg-config python3 postgresql-client-17 

# Run the application as a non-root user.
USER node

RUN mkdir /home/node/data
VOLUME /home/node/data

# Copy the rest of the source files into the image.
COPY ./src .

# Expose the port that the application listens on.
EXPOSE 3000

# Run the application.
CMD node index.js
