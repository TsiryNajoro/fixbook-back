require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Company = require('../models/Company');
const User = require('../models/User');
const Problem = require('../models/Problem');

async function seed() {
  await connectDB();

  await Promise.all([Company.deleteMany({}), User.deleteMany({}), Problem.deleteMany({})]);

  const company = await Company.create({ name: 'Acme Corp', domain: 'acme.test' });

  const alice = new User({ company: company._id, name: 'Alice', email: 'alice@acme.test', department: 'Backend Engineer' });
  await alice.setPassword('password123');
  await alice.save();

  const bob = new User({ company: company._id, name: 'Bob', email: 'bob@acme.test', department: 'DevOps' });
  await bob.setPassword('password123');
  await bob.save();

  const charlie = new User({ company: company._id, name: 'Charlie', email: 'charlie@acme.test', department: 'Database Admin' });
  await charlie.setPassword('password123');
  await charlie.save();

  const problem = await Problem.create({
    company: company._id,
    title: 'API returns 500 errors after deployment',
    description: 'The application works locally but fails in production after a new deployment.',
    category: 'Backend',
    application: 'Payment API',
    environment: 'Production',
    logs: 'Database connection refused',
    tags: ['docker', 'postgresql', 'deployment'],
    author: alice._id,
    solution: {
      description: 'The database URL environment variable was missing. Adding it to the deployment configuration fixed the issue.',
      troubleshootingSteps: [
        'Checked application logs.',
        'Verified database availability.',
        'Compared production and development configurations.',
        'Found missing environment variable.',
      ],
      author: alice._id,
      createdAt: new Date(),
      updatedAt: new Date(),
      validations: [
        { validator: bob._id, validatorName: bob.name, department: bob.department, comment: 'Confirmed on our staging redeploy too.' },
        { validator: charlie._id, validatorName: charlie.name, department: charlie.department, comment: '' },
      ],
    },
  });

  console.log('Seeded company:', company.domain);
  console.log('Login with alice@acme.test / password123 (or bob@ / charlie@)');
  console.log('Sample problem id:', problem._id.toString());

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
