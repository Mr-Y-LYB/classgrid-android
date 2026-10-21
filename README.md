# ClassGrid

安卓课程表，无广告。课程、设置和图片保存在手机本地；教务网页导入及检查更新需要联网。

## 使用

- 在“课表”切换或新建课表，设置开学日期、周数和 JPG 背景。
- 在“添加课程”录入课程、周次和节次；在“导入课表”导入 CSV、XLSX 或教务网页。批量导入会先显示预览。
- 点击课程可编辑、调课或停课。原时段保留变更提示。
- 在“设置”修改节次时间、开启提醒、导出或恢复 JSON 备份，以及导出 ICS 日历。

沈阳化工大学教务导入：打开 `https://jws.syuct.edu.cn/`，登录并进入学生个人课表，再点击“提取”。应用不保存教务密码。学校系统页面尚未完成真实账号验证；无法提取时可使用文件导入。

CSV/XLSX 表头：`课程,教师,教室,星期,开始节,结束节,周次`。周次示例：`1-16`、`1-16单`、`2-16双`、`1,3,5`。

## 更新

联网打开应用时检查 [GitHub Releases](https://github.com/Mr-Y-LYB/classgrid-android/releases)。确认更新后，应用下载并校验 APK，安卓系统会请求安装确认。下载失败时可重试，或使用窗口里的浏览器下载入口。

## 构建

需要 JDK 17 和 Android SDK 35。用 Android Studio 打开项目，或运行：

```powershell
.\gradlew.bat assembleDebug
node .\tests\core.test.js
```

发布版使用 `.signing/classgrid.jks` 和 `.signing/signing.properties` 签名；签名文件不上传仓库。构建命令：`.\gradlew.bat assembleRelease`。
