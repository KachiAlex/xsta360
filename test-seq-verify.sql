-- Check enrollment status after cron
SELECT id, status, current_step, updated_at FROM sequence_enrollments WHERE id = 'c3d4e5f6-a7b8-9012-cdef-345678901234';

-- Check if a reminder record was created for tracking
SELECT id, lead_id, channel, status, note, created_at FROM reminders WHERE sequence_step_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012';

-- Check audit log
SELECT event_type, created_at FROM audit_events WHERE meta->>'sequenceId' = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' ORDER BY created_at DESC LIMIT 3;
