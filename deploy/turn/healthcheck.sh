#!/bin/sh
set -eu
address=$TURN_LISTEN_IP
[ "$address" != 0.0.0.0 ] || address=127.0.0.1
exec timeout 4 openssl s_client \
  -connect "$address:$TURN_TLS_PORT" -servername "$TURN_REALM" \
  -verify_hostname "$TURN_REALM" -verify_return_error \
  -CAfile /run/turn-tls/fullchain.pem -brief </dev/null >/dev/null 2>&1
