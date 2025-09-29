#!/usr/bin/env node
const readline = require('readline');
const { createUser } = require('../db');

async function prompt(query, { silent = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (silent) {
      // hide input by temporarily muting output
      const setRaw = process.stdin.setRawMode;
      if (setRaw) process.stdin.setRawMode(true);
      let input = '';
      process.stdin.on('data', (char) => {
        char = char + '';
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004':
            process.stdin.pause();
            if (setRaw) process.stdin.setRawMode(false);
            process.stdout.write('\n');
            rl.close();
            resolve(input);
            break;
          case '\u0003':
            process.exit();
            break;
          default:
            process.stdout.write('*');
            input += char;
            break;
        }
      });
      process.stdout.write(query);
    } else {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function main() {
  const username = process.argv[2] || (await prompt('Username: '));
  const password = process.argv[3] || (await prompt('Password: ', { silent: true }));
  const role = process.argv[4] || 'admin';
  try {
    const user = await createUser(username.trim(), password.trim(), role.trim());
    console.log('User created:', user);
    process.exit(0);
  } catch (e) {
    console.error('Failed to create user:', e.message || e);
    process.exit(1);
  }
}

main();
