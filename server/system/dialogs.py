from __future__ import annotations

import platform
import subprocess


def pick_directory() -> str:
    system = platform.system()
    if system == "Darwin":
        return pick_directory_macos()
    raise RuntimeError("当前系统暂不支持后端目录选择器，请手动输入路径。")


def pick_directory_macos() -> str:
    script = 'POSIX path of (choose folder with prompt "选择项目根目录")'
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    if result.returncode != 0:
        output = (result.stderr or result.stdout).strip()
        if "User canceled" in output or "用户已取消" in output:
            return ""
        raise RuntimeError(output or "目录选择失败")
    return result.stdout.strip()
