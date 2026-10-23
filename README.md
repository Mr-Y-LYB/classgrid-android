# ClassGrid

安卓课程表，无广告。课程、设置和图片保存在手机本地；教务网页导入及检查更新需要联网。

## 使用

- 在“课表”切换或新建课表，设置开学日期、周数和 JPG 背景。
- 点击课表左上角的太阳／月亮图标切换白天和夜间模式。
- 在“添加课程”录入课程；每个时段可分别填写教室，选择全部周数、单周、双周或自选周次。“导入课表”页可导入 CSV、XLSX 或教务网页，批量导入会先显示预览，可自行调整导入周次。
- 点击课程可编辑、调课或停课。
- 在“设置”的课表、提醒、数据与应用分区中修改节次时间、开启提醒、导出或恢复 JSON 备份，以及导出 ICS 日历。
- 课前通知需开启通知和精确提醒权限。清除最近后台任务后，已保存的提醒由安卓系统继续执行；在系统设置中“强行停止”应用后，需要重新打开才能恢复。
- 在“设置→反馈问题”打开 GitHub Issues 或通过系统分享反馈文本。

供沈阳化工大学学生使用，沈阳化工大学教务导入： `https://jws.syuct.edu.cn/`，登录并进入学生个人课表，再点击“提取”。应用不保存教务密码；无法提取时可使用文件导入。

CSV/XLSX 表头：`课程,教师,教室,星期,开始节,结束节,周次`。周次可填`全部周数`、`单周`、`双周`，也支持`1-12单`、`1,3,5`等范围。

## 更新

联网打开应用时检查 [GitHub Releases](https://github.com/Mr-Y-LYB/classgrid-android/releases)。确认更新后，应用下载并校验 APK，安卓系统会请求安装确认。下载失败时可重试，或使用窗口里的浏览器下载入口。

## 构建

需要 JDK 17 和 Android SDK 35。用 Android Studio 打开项目，或运行：

```powershell
.\gradlew.bat assembleDebug
node .\tests\core.test.js
```

发布版使用 `.signing/classgrid.jks` 和 `.signing/signing.properties` 签名；签名文件不上传仓库。构建命令：`.\gradlew.bat assembleRelease`。

应用内“更新说明”使用 `CHANGELOG.md` 的内容。修改后运行 `node scripts/sync-changelog.cjs`；构建时会检查两者一致。
