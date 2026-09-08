// Resolve the actual TCP listener and its launch ancestry before browser workers.
const fs = require('node:fs');
const cp = require('node:child_process');
function listeners(port) {
  if (process.platform !== 'linux') {
    const result = cp.spawnSync('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], {encoding: 'utf8'});
    if (result.error || ![0, 1].includes(result.status)) throw Error('Listener inspection failed');
    return [...new Set(result.stdout.trim().split('\n').filter(Boolean).map(Number))];
  }
  const inodes = new Set();
  for (const name of ['tcp', 'tcp6']) {
    for (const line of fs.readFileSync(`/proc/net/${name}`, 'utf8').trim().split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (parseInt(fields[1].split(':')[1], 16) === port && fields[3] === '0A') inodes.add(fields[9]);
    }
  }
  if (!inodes.size) return [];
  const owners = new Set();
  for (const pid of fs.readdirSync('/proc').filter(x => /^\d+$/.test(x))) {
    let fds;
    try { fds = fs.readdirSync(`/proc/${pid}/fd`); } catch { continue; }
    for (const fd of fds) {
      let target;
      try { target = fs.readlinkSync(`/proc/${pid}/fd/${fd}`); } catch { continue; }
      const inode = /^socket:\[(\d+)\]$/.exec(target)?.[1];
      if (inodes.has(inode)) owners.add(Number(pid));
    }
  }
  if (!owners.size) throw Error('Listening socket exists but its process is unavailable');
  return [...owners];
}
function processInfo(pid) {
  if (process.platform === 'linux') {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const ppid = Number(/^PPid:\s+(\d+)$/m.exec(status)?.[1]);
    if (!Number.isInteger(ppid)) throw Error('Parent PID unavailable');
    return {pid, ppid, cwd: fs.realpathSync(`/proc/${pid}/cwd`), command: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()};
  }
  const fields = cp.execFileSync('ps', ['-p', String(pid), '-o', 'ppid=', '-o', 'command='], {encoding: 'utf8'}).trim();
  const match = /^(\d+)\s+([\s\S]+)$/.exec(fields);
  const cwdLines = cp.execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {encoding: 'utf8'}).split('\n');
  const cwd = cwdLines.find(x => x.startsWith('n'))?.slice(1);
  if (!match || !cwd) throw Error('Process ancestry unavailable');
  return {pid, ppid: Number(match[1]), command: match[2], cwd: fs.realpathSync(cwd)};
}
function verify({root, port, launch, baseURL}) {
  const expectedRoot = fs.realpathSync(root);
  if (launch.cwd !== expectedRoot || launch.command !== 'npm run dev' || baseURL !== `http://127.0.0.1:${port}`) throw Error('Server launch configuration mismatch');
  const pids = listeners(port);
  if (!pids.length) throw Error('No server listener');
  const owners = pids.map(pid => {
    const chain = []; let current = pid;
    while (current > 1 && chain.length < 32) {
      const item = processInfo(current); chain.push(item);
      if (current === launch.wrapperPid) break;
      current = item.ppid;
    }
    if (chain[0].cwd !== expectedRoot || !chain.some(x => x.pid === launch.childPid) || chain.at(-1).pid !== launch.wrapperPid) throw Error('Listener does not belong to this checkout and launch');
    if (!chain.some(x => /next(?:\/dist\/bin\/next)?\s+dev\s+--webpack/.test(x.command))) throw Error('Actual Next development command unavailable');
    return {pid, cwd: chain[0].cwd, chain};
  });
  return {verified: true, port, baseURL, expectedRoot, launch, owners, method: process.platform === 'linux' ? 'proc TCP inode/listener fd and process ancestry' : 'lsof listener/cwd and ps ancestry'};
}
module.exports = {listeners, verify};
