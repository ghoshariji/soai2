require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./src/config/database');
const User = require('./src/models/User');
const Society = require('./src/models/Society');
const Subscription = require('./src/models/Subscription');
const logger = require('./src/utils/logger');

const seedSuperAdmin = async () => {
  const existing = await User.findOne({ role: 'super_admin' });
  if (existing) {
    logger.info('Super admin already exists. Skipping...');
    return;
  }

  const admin = await User.create({
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@soai.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123',
    role: 'super_admin',
    status: 'active',
  });

  logger.info(`✅ Super Admin created: ${admin.email}`);
};

const seedSampleSociety = async () => {
  const existingSociety = await Society.findOne({ name: 'Green Valley Society' });
  if (existingSociety) {
    logger.info('Sample society already exists. Skipping...');
    return;
  }

  const society = await Society.create({
    name: 'Green Valley Society',
    address: '123, Green Valley Road',
    city: 'Mumbai',
    status: 'active',
  });

  const password = 'Admin@1234';
  const admin = await User.create({
    name: 'Society Admin',
    email: 'admin@greenvalley.com',
    password,
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

  // Sample residents
  const residents = [
    { name: 'Rahul Sharma', email: 'rahul@greenvalley.com', phone: '9876543210', flatNumber: 'A-101' },
    { name: 'Priya Patel', email: 'priya@greenvalley.com', phone: '9876543211', flatNumber: 'B-202' },
    { name: 'Amit Kumar', email: 'amit@greenvalley.com', phone: '9876543212', flatNumber: 'C-303' },
  ];

  for (const r of residents) {
    await User.create({
      ...r,
      password: 'User@1234',
      role: 'user',
      societyId: society._id,
      status: 'active',
    });
  }

  logger.info(`✅ Sample society seeded: ${society.name}`);
  logger.info(`   Admin email: ${admin.email} | Password: ${password}`);
  logger.info(`   ${residents.length} sample residents created (Password: User@1234)`);
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
    logger.info('✅ Seeding complete!');
  }

  process.exit(0);
};

run().catch((err) => {
  logger.error(`Seeder error: ${err.message}`);
  process.exit(1);
});
