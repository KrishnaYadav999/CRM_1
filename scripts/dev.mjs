import { spawn } from 'node:child_process'

const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run this script through npm: npm run dev')

const processes = [
  spawn(process.execPath, [npmCli, 'run', 'dev:backend'], { stdio: 'inherit' }),
  spawn(process.execPath, [npmCli, 'run', 'dev:frontend'], { stdio: 'inherit' })
]

let shuttingDown = false

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true

  for (const child of processes) {
    if (!child.killed) child.kill()
  }

  process.exitCode = exitCode
}

for (const child of processes) {
  child.on('error', (error) => {
    console.error(error.message)
    shutdown(1)
  })

  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0 && signal === null) shutdown(code ?? 1)
  })
}

process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())
