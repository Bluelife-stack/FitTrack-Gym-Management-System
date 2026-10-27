-- 1. Members (WHERE + ORDER BY)
SELECT id, full_name, phone, status FROM members WHERE status = 'active' ORDER BY full_name;
-- 2. Plans
SELECT * FROM membership_plans ORDER BY price;
-- 3. Member membership plan INNER JOIN
SELECT m.full_name, p.name AS plan, ms.start_date, ms.end_date FROM memberships ms JOIN members m ON m.id=ms.member_id JOIN membership_plans p ON p.id=ms.plan_id;
-- 4. Attendance history
SELECT a.check_in_date, m.full_name FROM attendance a JOIN members m ON m.id=a.member_id ORDER BY a.check_in_date DESC;
-- 5. Daily check-ins (GROUP BY)
SELECT check_in_date, COUNT(*) AS check_ins FROM attendance GROUP BY check_in_date ORDER BY check_in_date DESC;
-- 6. Total recorded payments (SUM)
SELECT COALESCE(SUM(amount),0) AS total_revenue FROM payments;
-- 7. Membership state counts
SELECT CASE WHEN end_date < CURRENT_DATE THEN 'expired' WHEN end_date <= CURRENT_DATE + 7 THEN 'expiring soon' ELSE 'active' END AS state, COUNT(*) FROM memberships WHERE status='active' GROUP BY 1;
-- 8. Expiring soon
SELECT m.full_name, ms.end_date FROM memberships ms JOIN members m ON m.id=ms.member_id WHERE ms.status='active' AND ms.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7;
-- 9. Expired
SELECT m.full_name, ms.end_date FROM memberships ms JOIN members m ON m.id=ms.member_id WHERE ms.status='active' AND ms.end_date < CURRENT_DATE;
-- 10. Members with no attendance (LEFT JOIN)
SELECT m.full_name FROM members m LEFT JOIN attendance a ON a.member_id=m.id WHERE a.id IS NULL;
-- 11. Members with no payments
SELECT m.full_name FROM members m LEFT JOIN payments p ON p.member_id=m.id WHERE p.id IS NULL;
-- 12. Payments by member
SELECT m.full_name, COUNT(p.id) AS payment_count, SUM(p.amount) AS paid FROM members m JOIN payments p ON p.member_id=m.id GROUP BY m.id, m.full_name HAVING SUM(p.amount) > 0 ORDER BY paid DESC;
