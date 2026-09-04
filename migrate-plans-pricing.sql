UPDATE plans SET base_price_monthly=1500, per_seat_price_monthly=500, trial_days=7, position=0, active=true,
  features='{"contact_card":true,"custom_fields":true,"reports":false,"sequences":false,"api_access":false,"sso":false,"dedicated_support":false,"max_members":3}' WHERE name='Starter';
UPDATE plans SET base_price_monthly=3000, per_seat_price_monthly=1000, trial_days=7, position=1, active=true,
  features='{"contact_card":true,"custom_fields":true,"reports":true,"sequences":true,"api_access":false,"sso":false,"dedicated_support":false,"max_members":10}' WHERE name='Standard';
UPDATE plans SET base_price_monthly=6000, per_seat_price_monthly=1500, trial_days=7, position=2, active=true,
  features='{"contact_card":true,"custom_fields":true,"reports":true,"sequences":true,"api_access":true,"sso":false,"dedicated_support":false,"max_members":25}' WHERE name='Pro';
UPDATE plans SET base_price_monthly=15000, per_seat_price_monthly=2000, trial_days=7, position=3, active=true,
  features='{"contact_card":true,"custom_fields":true,"reports":true,"sequences":true,"api_access":true,"sso":true,"dedicated_support":true,"max_members":null}' WHERE name='Enterprise';
SELECT name, base_price_monthly, per_seat_price_monthly, trial_days, position, features FROM plans ORDER BY position;
