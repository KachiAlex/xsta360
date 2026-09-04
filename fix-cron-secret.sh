#!/bin/bash
set -e

# Extract the cron secret from the app env file.
CRON_SECRET=$(grep '^CRON_SECRET=' /opt/xsta360/.env | cut -d= -f2)

# Write a restricted env file for cron jobs.
cat > /opt/xsta360/.cron-env <<EOF
CRON_SECRET=$CRON_SECRET
EOF
chmod 600 /opt/xsta360/.cron-env
chown root:root /opt/xsta360/.cron-env

# Rewrite the cron file to source the env file instead of hardcoding the secret.
cat > /etc/cron.d/xsta360-cron <<'CRONEOF'
# Xsta360 app crons — secret sourced from /opt/xsta360/.cron-env (chmod 600)
# Reminders: every 10 minutes (time-sensitive follow-up alerts)
*/10 * * * * root . /opt/xsta360/.cron-env && curl -sf -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3009/api/cron/reminders >> /var/log/xsta360-reminders.log 2>&1
# Digest: once daily at 8am (summary email, not every 10 min)
0 8 * * * root . /opt/xsta360/.cron-env && curl -sf -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3009/api/cron/digest >> /var/log/xsta360-digest.log 2>&1
# Billing: daily at 3am (renewals, trial conversions, dunning)
0 3 * * * root . /opt/xsta360/.cron-env && curl -sf -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3009/api/cron/billing >> /var/log/xsta360-billing.log 2>&1
CRONEOF
chmod 644 /etc/cron.d/xsta360-cron

echo "=== cron file ==="
cat /etc/cron.d/xsta360-cron
echo "=== env file perms ==="
ls -la /opt/xsta360/.cron-env
