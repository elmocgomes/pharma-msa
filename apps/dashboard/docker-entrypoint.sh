#!/bin/sh
# Replace API_URL placeholder in nginx config
sed "s|__API_URL__|${API_URL:-http://localhost:3000}|g" \
  /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
