FROM alpine:3.20

RUN apk add --no-cache coturn=4.6.2-r0

COPY coturn.conf /etc/coturn/turnserver.conf

EXPOSE 3478/udp
EXPOSE 3478/tcp
EXPOSE 443/tcp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD nc -zv localhost 3478 || exit 1

CMD ["turnserver", "-c", "/etc/coturn/turnserver.conf"]
