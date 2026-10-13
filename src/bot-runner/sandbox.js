const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const MAX_STDERR_BYTES = 8 * 1024;

function getSandboxCapabilities() {
  if (process.platform === "darwin" && fs.existsSync("/usr/bin/sandbox-exec")) {
    return { kind: "macos-sandbox-exec" };
  }

  if (process.platform === "linux" && commandExists("bwrap")) {
    return { kind: "linux-bwrap" };
  }

  return null;
}

function commandExists(command) {
  const paths = (process.env.PATH || "").split(path.delimiter);
  return paths.some((directory) => {
    const candidate = path.join(directory, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function quoteProfilePath(value) {
  return `(subpath ${JSON.stringify(value)})`;
}

function createMacProfile({ workdir, writable }) {
  const writeRules = ["(deny file-write*)"];
  if (writable) {
    writeRules.push(`(allow file-write* ${quoteProfilePath(workdir)})`);
    writeRules.push(`(allow file-write* ${quoteProfilePath(os.tmpdir())})`);
    try {
      const realTempRoot = fs.realpathSync(os.tmpdir());
      if (realTempRoot !== os.tmpdir()) {
        writeRules.push(`(allow file-write* ${quoteProfilePath(realTempRoot)})`);
      }
    } catch {
      // The logical temp path is still allowed above.
    }
  }

  return [
    "(version 1)",
    "(deny default)",
    "(allow process-exec)",
    ...(writable ? ["(allow process-fork)"] : []),
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "(allow ipc-posix-shm)",
    "(allow file-read*)",
    "(deny file-read* (subpath \"/Users\"))",
    "(deny file-read* (subpath \"/private/etc\"))",
    "(deny file-read* (subpath \"/private/var/root\"))",
    "(deny network*)",
    ...writeRules,
  ].join("\n");
}

function buildCommand({ capability, command, args, workdir, writable, timeoutMs, maxMemoryMb, maxProcesses }) {
  const limitScript = [
    `ulimit -t ${Math.max(1, Math.ceil(timeoutMs / 1000))}`,
    `ulimit -v ${Math.max(16, maxMemoryMb) * 1024} 2>/dev/null || true`,
    `ulimit -u ${Math.max(1, maxProcesses)} 2>/dev/null || true`,
    "ulimit -n 64 2>/dev/null || true",
    'exec "$@"',
  ].join("; ");
  const limitedCommand = "/bin/sh";
  const limitedArgs = ["-c", limitScript, "ott-bot", command, ...args];

  if (capability.kind === "macos-sandbox-exec") {
    return {
      command: "/usr/bin/sandbox-exec",
      args: ["-p", createMacProfile({ workdir, writable }), limitedCommand, ...limitedArgs],
    };
  }

  if (capability.kind === "linux-bwrap") {
    return {
      command: "bwrap",
      args: [
        "--die-with-parent",
        "--unshare-all",
        "--new-session",
        "--ro-bind",
        "/usr",
        "/usr",
        "--ro-bind",
        "/bin",
        "/bin",
        "--ro-bind",
        "/lib",
        "/lib",
        "--ro-bind",
        "/lib64",
        "/lib64",
        "--bind",
        workdir,
        workdir,
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--chdir",
        workdir,
        limitedCommand,
        ...limitedArgs,
      ],
    };
  }

  throw new Error("BOT_SANDBOX_UNAVAILABLE");
}

function runSandboxed({
  command,
  args = [],
  workdir,
  stdin,
  timeoutMs,
  maxOutputBytes,
  maxMemoryMb = 128,
  maxProcesses = 16,
  writable = false,
}) {
  const capability = getSandboxCapabilities();
  if (!capability) {
    return Promise.reject(new Error("BOT_SANDBOX_UNAVAILABLE"));
  }

  const launch = buildCommand({
    capability,
    command,
    args,
    workdir,
    writable,
    timeoutMs,
    maxMemoryMb,
    maxProcesses,
  });
  const env = {
    PATH: process.env.PATH || "/usr/bin:/bin",
    LANG: "C.UTF-8",
    HOME: workdir,
    TMPDIR: workdir,
  };

  return new Promise((resolve, reject) => {
    const child = spawn(launch.command, launch.args, {
      cwd: workdir,
      env,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      terminateProcessTree(child);
      finish(new Error("BOT_EXECUTION_TIMEOUT"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        terminateProcessTree(child);
        finish(new Error("BOT_OUTPUT_LIMIT_EXCEEDED"));
        return;
      }
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      if (Buffer.byteLength(stderr, "utf8") < MAX_STDERR_BYTES) {
        stderr += chunk.toString("utf8").slice(0, MAX_STDERR_BYTES - Buffer.byteLength(stderr, "utf8"));
      }
    });

    child.on("error", (error) => finish(new Error("BOT_SANDBOX_UNAVAILABLE", { cause: error })));
    child.on("close", (code, signal) => {
      if (settled) return;
      if (/sandbox.*(Operation not permitted|unbound variable)/i.test(stderr)) {
        finish(new Error("BOT_SANDBOX_UNAVAILABLE"));
        return;
      }
      finish(null, { code, signal, stdout, stderr });
    });

    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

function terminateProcessTree(child) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

async function withTempDirectory(callback) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ott-bot-"));
  try {
    return await callback(directory);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

module.exports = {
  getSandboxCapabilities,
  runSandboxed,
  withTempDirectory,
};
