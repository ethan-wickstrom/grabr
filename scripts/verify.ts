const steps: Array<{ name: string; cmd: string[] }> = [
  { name: "Run tests", cmd: ["bun", "test"] },
  { name: "Build (dist + types)", cmd: ["bun", "run", "build"] },
  {
    name: "Verify package tarball contents (dry-run)",
    cmd: ["bun", "pm", "pack", "--dry-run", "--ignore-scripts"],
  },
];

for (const step of steps) {
  console.log(`[verify] ${step.name}`);
  const proc = Bun.spawn(step.cmd, {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`[verify] Failed: ${step.cmd.join(" ")}`);
  }
}
