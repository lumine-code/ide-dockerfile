from alpine:3.20 AS base
MAINTAINER Example <example@example.com>
ARG APP_HOME=/app
ENV APP_HOME=$APP_HOME
WORKDIR $APP_HOME
COPY package.json ./
RUN echo hello \
&& echo world
CMD ['sh']
