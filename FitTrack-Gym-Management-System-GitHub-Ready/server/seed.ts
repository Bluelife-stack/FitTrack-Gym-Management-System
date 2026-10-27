import { query, pool } from './db.js';
const plan = await query(`INSERT INTO membership_plans (name,price,duration_days,description) VALUES ('Monthly',1200,30,'Full gym access'),('Quarterly',3200,90,'Save with three months'),('Annual',11000,365,'Best value') ON CONFLICT (name) DO NOTHING RETURNING id`);
const member = await query(`INSERT INTO members (full_name,phone,email) VALUES ('Aarav Sharma','9876543210','aarav@example.com'),('Priya Patel','9876543211','priya@example.com') ON CONFLICT (phone) DO NOTHING RETURNING id`);
console.log(`Seed complete. New plans: ${plan.rowCount}; new members: ${member.rowCount}`);
await pool.end();
