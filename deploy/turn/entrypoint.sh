#!/bin/sh
set -eu
umask 077

fail() { echo "Coturn configuration error: $1" >&2; exit 1; }
ipv4() {
  case "$1" in ''|*[!0-9.]*|.*|*.) return 1 ;; esac
  old_ifs=$IFS
  IFS=.
  set -- $1
  IFS=$old_ifs
  [ "$#" -eq 4 ] || return 1
  for octet do
    [ -n "$octet" ] && [ "$octet" -le 255 ] || return 1
  done
}
number() {
  case "$2" in ''|*[!0-9]*) fail "invalid $1" ;; esac
  [ "$2" -gt 0 ] && [ "$2" -le "$3" ] || fail "out-of-range $1"
}

case "$TURN_REALM" in ''|*[!a-zA-Z0-9.-]*) fail 'invalid TURN_REALM' ;; esac
ipv4 "$TURN_LISTEN_IP" && ipv4 "$TURN_RELAY_IP" && ipv4 "$TURN_PUBLIC_IP" || fail 'IPv4 addresses required'
number TURN_PORT "$TURN_PORT" 65535
number TURN_TLS_PORT "$TURN_TLS_PORT" 65535
number TURN_MIN_PORT "$TURN_MIN_PORT" 65535
number TURN_MAX_PORT "$TURN_MAX_PORT" 65535
number TURN_METRICS_PORT "$TURN_METRICS_PORT" 65535
[ "$TURN_TLS_PORT" -ge 1024 ] && [ "$TURN_PORT" -ge 1024 ] || fail 'use unprivileged listener ports; use Traefik TCP passthrough for public 443'
[ "$TURN_MIN_PORT" -ge 1024 ] && [ "$TURN_MIN_PORT" -le "$TURN_MAX_PORT" ] || fail 'invalid relay range'
[ "$TURN_PORT" -ne "$TURN_TLS_PORT" ] || fail 'listener ports must differ'
number TURN_USER_QUOTA "$TURN_USER_QUOTA" 100000
number TURN_TOTAL_QUOTA "$TURN_TOTAL_QUOTA" 100000
number TURN_MAX_BPS "$TURN_MAX_BPS" 10000000000
number TURN_BPS_CAPACITY "$TURN_BPS_CAPACITY" 10000000000
[ "$TURN_USER_QUOTA" -le "$TURN_TOTAL_QUOTA" ] || fail 'user quota exceeds total quota'
[ "$TURN_MAX_BPS" -le "$TURN_BPS_CAPACITY" ] || fail 'session bandwidth exceeds capacity'

secret=$(cat /run/secrets/turn_auth_secret) || fail 'missing shared secret'
case "$secret" in *[!a-fA-F0-9]*) fail 'shared secret must be 64 hexadecimal characters' ;; esac
[ "${#secret}" -eq 64 ] || fail 'shared secret must be 64 hexadecimal characters'
cert=/run/turn-tls/fullchain.pem
key=/run/turn-tls/privkey.pem
[ -r "$cert" ] && [ -r "$key" ] || fail 'unreadable TLS certificate/key'
openssl x509 -in "$cert" -noout -checkend 3600 >/dev/null 2>&1 || fail 'TLS certificate invalid or expires within one hour'
openssl x509 -in "$cert" -noout -checkhost "$TURN_REALM" >/dev/null 2>&1 || fail 'TLS certificate hostname mismatch'
openssl pkey -in "$key" -noout >/dev/null 2>&1 || fail 'invalid TLS private key'
cert_public=$(openssl x509 -in "$cert" -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256)
key_public=$(openssl pkey -in "$key" -pubout -outform DER | openssl dgst -sha256)
[ "$cert_public" = "$key_public" ] || fail 'TLS certificate/key mismatch'

cat /opt/peerweave-turn/turnserver.conf > /tmp/turnserver.conf
cat >> /tmp/turnserver.conf <<EOF
realm=$TURN_REALM
server-name=$TURN_REALM
listening-ip=$TURN_LISTEN_IP
relay-ip=$TURN_RELAY_IP
external-ip=$TURN_PUBLIC_IP/$TURN_RELAY_IP
listening-port=$TURN_PORT
tls-listening-port=$TURN_TLS_PORT
min-port=$TURN_MIN_PORT
max-port=$TURN_MAX_PORT
user-quota=$TURN_USER_QUOTA
total-quota=$TURN_TOTAL_QUOTA
max-bps=$TURN_MAX_BPS
bps-capacity=$TURN_BPS_CAPACITY
prometheus-port=$TURN_METRICS_PORT
cert=$cert
pkey=$key
static-auth-secret=$secret
EOF
unset secret
exec turnserver -c /tmp/turnserver.conf
