-- Create a test sequence
INSERT INTO sequences (id, org_id, name, description, active, created_by)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '64926fd4-bb2d-4ead-b2d0-98f49b1959be',
  'TEST - Email Flow Test (delete me)',
  'Temporary sequence for testing email sending',
  true,
  NULL
)
ON CONFLICT (id) DO UPDATE SET active = true;

-- Create an email step with delayDays=0 so it fires immediately
INSERT INTO sequence_steps (id, sequence_id, org_id, position, delay_days, action, subject, body, sender_name, attachments)
VALUES (
  'b2c3d4e5-f6a7-8901-bcde-f23456789012',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '64926fd4-bb2d-4ead-b2d0-98f49b1959be',
  0,
  0,
  'email',
  'TEST: Email Sequence Flow Test',
  '<p>Hi {{first_name}},</p><p>This is a <strong>test email</strong> from the Xsta360 sequence flow.</p><p>Testing: <em>rich text</em>, <a href="https://xsta360.com.ng">links</a>, and alignment.</p><p>— {{org_name}}</p>',
  'Tunde from Kreatix',
  '[]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body;

-- Enroll a lead (use Redemption Anyanwu)
INSERT INTO sequence_enrollments (id, sequence_id, org_id, lead_id, current_step, status, enrolled_at)
VALUES (
  'c3d4e5f6-a7b8-9012-cdef-345678901234',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '64926fd4-bb2d-4ead-b2d0-98f49b1959be',
  '536a1f53-b42f-458d-82fe-a0585f31e984',
  0,
  'active',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET current_step = 0, status = 'active', enrolled_at = NOW();

-- Verify
SELECT 'sequence' as type, id, name, active FROM sequences WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
SELECT 'step' as type, id, action, subject, sender_name FROM sequence_steps WHERE id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
SELECT 'enrollment' as type, id, status, current_step FROM sequence_enrollments WHERE id = 'c3d4e5f6-a7b8-9012-cdef-345678901234';
