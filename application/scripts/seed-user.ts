import { createUser } from '@data';

const email = process.env.SEED_EMAIL ?? 'demo@example.com';
const name = process.env.SEED_NAME ?? 'Demo User';
const password = process.env.SEED_PASSWORD ?? 'password123';

async function main() {
  try {
    const user = await createUser({ email, name, password });
    console.log(`Seeded user: ${user.email} (${user.name})`);
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      console.log(`User already exists: ${email}`);
    } else {
      throw err;
    }
  }
}

main();
