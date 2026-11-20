import { spawn } from 'node:child_process'
import console from 'node:console'
import path from 'node:path'
import process from 'node:process'

export const DEV_APP_CONFIG_NAMESPACE = 'com.tolaria.app.dev'
export const DEV_TAURI_CONFIG_PATH = path.join('src-tauri', 'tauri.dev.conf.json')

const repoRoot = path.resolve(import.meta.dirname, '..')

export function tauriBinary(platform = process.platform) {
  return path.join(
    repoRoot,
    'node_modules',
    '.bin',
    platform === 'win32' ? 'tauri.cmd' : 'tauri',
  )
}

export function isTauriDevCommand(args) {
  return args[0] === 'dev'
}

export function hasTauriConfigArgument(args) {
  return args.some((arg, index) => (
    arg === '--config'
    || arg.startsWith('--config=')
    || args[index - 1] === '--config'
  ))
}

export function tauriArgs(args) {
  if (!isTauriDevCommand(args) || hasTauriConfigArgument(args)) return args
  return [...args, '--config', DEV_TAURI_CONFIG_PATH]
}

export function tauriEnv(args, env = process.env) {
  if (!isTauriDevCommand(args)) return env
  return {
    ...env,
    TOLARIA_APP_CONFIG_NAMESPACE: DEV_APP_CONFIG_NAMESPACE,
  }
}

// Xcode 27's actool fails with "Bad file descriptor" when stdin is closed, which
// is how Tauri's bundler spawns it while compiling Tolaria.icon. This directory
// holds an actool wrapper that reopens stdin on /dev/null.
export const MACOS_SHIM_DIR = path.join(repoRoot, 'scripts', 'macos-shims')

export function needsActoolStdinShim(args, platform = process.platform) {
  return platform === 'darwin' && args[0] === 'build'
}

export function withShimDirOnPath(env, shimDir = MACOS_SHIM_DIR) {
  return { ...env, PATH: [shimDir, env.PATH].filter(Boolean).join(path.delimiter) }
}

export function shouldUseShell(platform = process.platform) {
  return platform === 'win32'
}

export function tauriSpawnOptions(args, env = process.env, platform = process.platform) {
  return {
    cwd: repoRoot,
    env: tauriEnv(args, env),
    shell: shouldUseShell(platform),
    stdio: 'inherit',
  }
}

export function runTauriCli(args = process.argv.slice(2), env = process.env) {
  const childEnv = needsActoolStdinShim(args) ? withShimDirOnPath(env) : env
  const child = spawn(tauriBinary(), tauriArgs(args), tauriSpawnOptions(args, childEnv))

  child.on('error', (error) => {
    console.error(error)
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })

  return child
}

if (process.argv[1] === import.meta.filename) {
  runTauriCli()
}
