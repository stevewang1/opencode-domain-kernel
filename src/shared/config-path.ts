import * as os from "node:os"
import * as path from "node:path"
import * as fs from "node:fs"

export function getUserConfigDir(): string {
  const platform = os.platform()
  const home = os.homedir()
  switch (platform) {
    case "win32": {
      // Windows: 优先使用 .config（如果存在），否则使用 APPDATA
      const dotConfig = path.join(home, ".config")
      const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming")
      // 检查 .config/opencode 是否存在
      try {
        if (fs.existsSync(path.join(dotConfig, "opencode"))) {
          return dotConfig
        }
      } catch {
        // 忽略错误
      }
      return appData
    }
    case "darwin":
      return path.join(home, ".config")
    default:
      return path.join(home, ".config")
  }
}
