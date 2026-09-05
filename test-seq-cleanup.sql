-- Clean up test data
DELETE FROM sequence_enrollments WHERE id = 'c3d4e5f6-a7b8-9012-cdef-345678901234';
DELETE FROM reminders WHERE sequence_step_id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
DELETE FROM sequence_steps WHERE id = 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
DELETE FROM sequences WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
SELECT 'cleanup done' as result;
