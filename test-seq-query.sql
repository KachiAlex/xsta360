-- Find a lead with an email for testing
SELECT id, name, email FROM leads WHERE email IS NOT NULL LIMIT 3;
-- Find the org
SELECT id, name FROM organizations LIMIT 1;
