import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const STATE_DIR = path.join(REPO_ROOT, '.agent-state');
const STATE_FILE = path.join(STATE_DIR, 'parks-research.json');
const LOG_DIR = path.join(REPO_ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'auto-parks-agent.log');
const LOCK_FILE = path.join(STATE_DIR, 'parks-research.lock');
const PROMPT_FILE = path.join(REPO_ROOT, 'scripts', 'prompts', 'park-research-prompt.md');

// Configuration defaults
const DEFAULT_MIN_HOURS = 24; // 1 day
const DEFAULT_MAX_HOURS = 48; // 2 days

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (err) {
    // Ignore logging errors
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    log(`Warning: Failed to read state file: ${err.message}`);
  }
  return {};
}

function saveState(state) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (err) {
    log(`Error: Failed to write state file: ${err.message}`);
  }
}

function computeNextRun(minHours, maxHours, baseDate = new Date()) {
  const hours = minHours + Math.random() * (maxHours - minHours);
  const nextMs = baseDate.getTime() + hours * 3600 * 1000;
  return new Date(nextMs);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function findAgentBinary(preferredBin) {
  const candidates = preferredBin
    ? [preferredBin]
    : [
        process.env.AGENT_BIN,
        'agy',
        'claude',
        '/home/beno/.local/bin/agy',
        '/home/beno/.local/bin/claude',
      ].filter(Boolean);

  for (const bin of candidates) {
    try {
      execSync(`which ${bin}`, { stdio: 'ignore' });
      return bin;
    } catch {
      if (fs.existsSync(bin)) return bin;
    }
  }
  return null;
}

function acquireLock() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  try {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      try {
        const content = fs.readFileSync(LOCK_FILE, 'utf8').split('\n');
        const pid = parseInt(content[0], 10);
        // Check if process still alive
        try {
          process.kill(pid, 0);
          return false; // Still running
        } catch {
          // Process died without clearing lock
          log(`Clearing stale lockfile from PID ${pid}`);
          fs.unlinkSync(LOCK_FILE);
          return acquireLock();
        }
      } catch {
        return false;
      }
    }
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (err) {
    log(`Warning: Failed to release lockfile: ${err.message}`);
  }
}

async function runAgent(agentBin, promptText) {
  log(`Starting agent run with: ${agentBin}`);
  const startTime = Date.now();

  return new Promise((resolve) => {
    // Both agy and claude support -p / --print with --dangerously-skip-permissions
    const args = ['-p', promptText, '--dangerously-skip-permissions'];

    const child = spawn(agentBin, args, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PAGER: 'cat',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      logStream.write(data);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
      logStream.write(data);
    });

    child.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      log(`Agent execution completed in ${elapsed}m with exit code ${code}`);
      logStream.end();
      resolve(code === 0);
    });

    child.on('error', (err) => {
      log(`Agent process error: ${err.message}`);
      resolve(false);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const isForce = args.includes('--force');
  const isStatus = args.includes('--status');
  const isDryRun = args.includes('--dry-run');

  const minHoursIdx = args.indexOf('--min-hours');
  const minHours = minHoursIdx !== -1 ? parseFloat(args[minHoursIdx + 1]) : DEFAULT_MIN_HOURS;

  const maxHoursIdx = args.indexOf('--max-hours');
  const maxHours = maxHoursIdx !== -1 ? parseFloat(args[maxHoursIdx + 1]) : DEFAULT_MAX_HOURS;

  const agentIdx = args.indexOf('--agent');
  const preferredAgent = agentIdx !== -1 ? args[agentIdx + 1] : null;

  const state = loadState();
  const now = new Date();

  // Status check
  if (isStatus) {
    console.log('=== Concrete Comeback Auto Parks Agent Status ===');
    console.log(`Current Time:  ${now.toISOString()}`);
    console.log(`Last Run:      ${state.last_run ? `${state.last_run} (${formatDuration(now.getTime() - new Date(state.last_run).getTime())} ago)` : 'Never'}`);
    console.log(`Last Status:   ${state.last_status || 'N/A'}`);
    if (state.next_run) {
      const diff = new Date(state.next_run).getTime() - now.getTime();
      const relative = diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(diff)} overdue`;
      console.log(`Next Run:      ${state.next_run} (${relative})`);
    } else {
      console.log('Next Run:      Not scheduled yet');
    }
    console.log(`Schedule:      Randomly every ${minHours} to ${maxHours} hours`);
    console.log(`Agent Binary:  ${findAgentBinary(preferredAgent) || 'Not found'}`);
    console.log(`State File:    ${STATE_FILE}`);
    console.log(`Log File:      ${LOG_FILE}`);
    return;
  }

  // Initialize schedule if missing
  if (!state.next_run) {
    const initialNext = computeNextRun(minHours, maxHours, now);
    state.next_run = initialNext.toISOString();
    saveState(state);
    log(`Initialized schedule. Next run set to ${state.next_run} (in ${formatDuration(initialNext.getTime() - now.getTime())}).`);
  }

  const nextRunTime = new Date(state.next_run).getTime();
  const isDue = now.getTime() >= nextRunTime;

  if (!isDue && !isForce) {
    const remaining = nextRunTime - now.getTime();
    log(`Not yet time to run. Next scheduled run: ${state.next_run} (in ${formatDuration(remaining)}).`);
    return;
  }

  if (isDryRun) {
    log(`[Dry Run] Trigger condition met (isDue=${isDue}, isForce=${isForce}).`);
    const simNext = computeNextRun(minHours, maxHours, now);
    log(`[Dry Run] Simulated next schedule would be: ${simNext.toISOString()}`);
    return;
  }

  // Acquire lock
  if (!acquireLock()) {
    log('Another agent execution is currently in progress. Exiting.');
    return;
  }

  try {
    const agentBin = findAgentBinary(preferredAgent);
    if (!agentBin) {
      throw new Error('No agent binary found (checked agy and claude). Ensure agy or claude is installed in PATH.');
    }

    if (!fs.existsSync(PROMPT_FILE)) {
      throw new Error(`Prompt file not found at: ${PROMPT_FILE}`);
    }

    const promptContent = fs.readFileSync(PROMPT_FILE, 'utf8');

    // Run agent
    state.last_run = now.toISOString();
    state.last_run_start = now.toISOString();
    saveState(state);

    const success = await runAgent(agentBin, promptContent);

    state.last_run_end = new Date().toISOString();
    state.last_status = success ? 'success' : 'failed';

    // Compute next randomized run between minHours and maxHours
    const nextRun = computeNextRun(minHours, maxHours, new Date());
    state.next_run = nextRun.toISOString();
    saveState(state);

    log(`Run finished (${state.last_status}). Next run scheduled for ${state.next_run} (in ${formatDuration(nextRun.getTime() - Date.now())}).`);
  } catch (err) {
    log(`Execution error: ${err.message}`);
    state.last_status = 'error';
    state.last_error = err.message;
    // Reschedule on error too
    const retryRun = computeNextRun(minHours, maxHours, new Date());
    state.next_run = retryRun.toISOString();
    saveState(state);
  } finally {
    releaseLock();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
