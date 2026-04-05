require('dotenv').config();
const connectDB = require('./src/config/database');
const User = require('./src/models/User');
const Society = require('./src/models/Society');
const Subscription = require('./src/models/Subscription');
const logger = require('./src/utils/logger');

/** One password for every seeded demo account (12 characters). Override with SEED_USER_PASSWORD. */
const SAMPLE_PASSWORD = process.env.SEED_USER_PASSWORD || 'SamplePass12';

const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'superadmin@soai.com').toLowerCase().trim();

/** All demo resident emails (same society). Kept in sync with seedSampleSociety + sync. */
const SAMPLE_RESIDENTS = [
  { name: 'Rahul Sharma', email: 'rahul@greenvalley.com', phone: '9876543210', flatNumber: 'A-101' },
  { name: 'Priya Patel', email: 'priya@greenvalley.com', phone: '9876543211', flatNumber: 'B-202' },
  { name: 'Amit Kumar', email: 'amit@greenvalley.com', phone: '9876543212', flatNumber: 'C-303' },
  { name: 'Sneha Reddy', email: 'sneha@greenvalley.com', phone: '9876543213', flatNumber: 'A-102' },
  { name: 'Vikram Singh', email: 'vikram@greenvalley.com', phone: '9876543214', flatNumber: 'B-201' },
  { name: 'Ananya Iyer', email: 'ananya@greenvalley.com', phone: '9876543215', flatNumber: 'C-304' },
  { name: 'Karan Mehta', email: 'karan@greenvalley.com', phone: '9876543216', flatNumber: 'D-401' },
  { name: 'Neha Joshi', email: 'neha@greenvalley.com', phone: '9876543217', flatNumber: 'D-402' },
];

const SOCIETY_ADMIN_EMAIL = 'admin@greenvalley.com';

/**
 * Emails for every account created or maintained by this seeder.
 * Used to reset passwords on each seed run (dev convenience).
 */
function getAllSeedEmails() {
  return [
    SUPER_ADMIN_EMAIL,
    SOCIETY_ADMIN_EMAIL,
    ...SAMPLE_RESIDENTS.map((r) => r.email.toLowerCase()),
  ];
}

/**
 * Set password for all known seed users (re-hashes via User pre-save).
 * Super admin keeps SUPER_ADMIN_PASSWORD when set; everyone else uses SAMPLE_PASSWORD.
 */
const syncSeedPasswords = async () => {
  const emails = getAllSeedEmails();
  let updated = 0;
  const superPw = process.env.SUPER_ADMIN_PASSWORD;
  for (const email of emails) {
    const user = await User.findOne({ email }).select('+password');
    if (!user) continue;
    if (email === SUPER_ADMIN_EMAIL && superPw) {
      user.password = superPw;
    } else {
      user.password = SAMPLE_PASSWORD;
    }
    await user.save();
    updated += 1;
  }
  if (updated) {
    logger.info(
      `🔑 Synced password for ${updated} seed account(s). Default demo password: "${SAMPLE_PASSWORD}"`,
    );
  }
};

const seedSuperAdmin = async () => {
  const existing = await User.findOne({ role: 'super_admin' });
  if (existing) {
    logger.info('Super admin already exists. Skipping create...');
    return;
  }

  const admin = await User.create({
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    email: SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD || SAMPLE_PASSWORD,
    role: 'super_admin',
    status: 'active',
  });

  logger.info(`✅ Super Admin created: ${admin.email}`);
};

const seedSampleSociety = async () => {
  let society = await Society.findOne({ name: 'Green Valley Society' });

  if (!society) {
    society = await Society.create({
      name: 'Green Valley Society',
      address: '123, Green Valley Road',
      city: 'Mumbai',
      status: 'active',
    });

    const admin = await User.create({
      name: 'Society Admin',
      email: SOCIETY_ADMIN_EMAIL,
      password: SAMPLE_PASSWORD,
      role: 'society_admin',
      societyId: society._id,
      status: 'active',
    });

    society.adminId = admin._id;
    await society.save();

    await Subscription.create({
      societyId: society._id,
      plan: 'premium',
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: 'active',
      features: {
        maxUsers: 500,
        maxGroups: 50,
        chatEnabled: true,
        feedEnabled: true,
        announcementsEnabled: true,
        complaintsEnabled: true,
        bulkUploadEnabled: true,
      },
    });

    logger.info(`✅ Sample society created: ${society.name}`);
  } else {
    logger.info('Sample society already exists. Skipping society/subscription create...');
  }

  // Ensure every sample resident exists (idempotent)
  const societyId = society._id;
  for (const r of SAMPLE_RESIDENTS) {
    const email = r.email.toLowerCase();
    const found = await User.findOne({ email });
    if (!found) {
      await User.create({
        name: r.name,
        email,
        phone: r.phone,
        flatNumber: r.flatNumber,
        password: SAMPLE_PASSWORD,
        role: 'user',
        societyId,
        status: 'active',
      });
      logger.info(`   + Resident created: ${email}`);
    }
  }

  // Ensure society admin exists
  const adminUser = await User.findOne({ email: SOCIETY_ADMIN_EMAIL });
  if (!adminUser) {
    await User.create({
      name: 'Society Admin',
      email: SOCIETY_ADMIN_EMAIL,
      password: SAMPLE_PASSWORD,
      role: 'society_admin',
      societyId,
      status: 'active',
    });
    const s = await Society.findById(societyId);
    if (s && !s.adminId) {
      const a = await User.findOne({ email: SOCIETY_ADMIN_EMAIL });
      s.adminId = a._id;
      await s.save();
    }
    logger.info(`   + Society admin created: ${SOCIETY_ADMIN_EMAIL}`);
  }

  logger.info('📋 Sample logins (password for all):');
  logger.info(`   Super admin: ${SUPER_ADMIN_EMAIL}`);
  logger.info(`   Society admin: ${SOCIETY_ADMIN_EMAIL}`);
  logger.info(`   Residents: ${SAMPLE_RESIDENTS.map((r) => r.email).join(', ')}`);
  logger.info(`   Password: ${SAMPLE_PASSWORD}`);
};

const destroyData = async () => {
  await Promise.all([
    User.deleteMany({}),
    Society.deleteMany({}),
    Subscription.deleteMany({}),
  ]);
  logger.info('🗑️  All data destroyed');
};

const run = async () => {
  await connectDB();

  if (process.argv[2] === '-d') {
    await destroyData();
  } else {
    await seedSuperAdmin();
    await seedSampleSociety();
    await syncSeedPasswords();
    logger.info('✅ Seeding complete!');
  }

  process.exit(0);
};

run().catch((err) => {
  logger.error(`Seeder error: ${err.message}`);
  process.exit(1);
});
