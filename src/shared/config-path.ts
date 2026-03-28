import * as os from "node:os"
import * as path from "node:path"

export function getUserConfigDir(): string {
  const platform = os.platform()
  const home = os.homedir()
  switch (platform) {
    case "win32":
      return process.env.APPDATA || path.join(home, "AppData", "Roaming")
    case "darwin":
      return path.join(home, ".config")
    default:
      return path.join(home, ".config")
  }
}
