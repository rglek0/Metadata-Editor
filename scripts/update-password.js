#!/usr/bin/env node
const { updatePassword } = require('../db');

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error('Usage: node scripts/update-password.js <username> <newPassword>');
    process.exit(1);
  }
  try {
    await updatePassword(username, password);
    console.log('Password updated for', username);
    process.exit(0);
  } catch (e) {
    console.error('Failed to update password:', e.message || e);
    process.exit(1);
  }
}

main();
