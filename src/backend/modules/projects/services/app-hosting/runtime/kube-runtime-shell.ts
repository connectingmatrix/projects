import { spawn } from 'node:child_process';

type CommandInput = {
  command: string;
  args: string[];
  stdin?: string;
};

export const runShellCommand = ({ command, args, stdin }: CommandInput): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${stderr || stdout}`));
    });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
