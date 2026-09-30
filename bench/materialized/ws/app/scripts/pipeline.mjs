const steps = ['lint', 'build', 'migrate', 'package'];
for (let i = 0; i < steps.length; i++) {
  if (i === 2) { console.error(`step ${i + 1} (${steps[i]}): FAILED (fixture, deterministic)`); process.exit(2); }
  console.log(`step ${i + 1} (${steps[i]}): ok`);
}
